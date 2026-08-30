/**
 * O app.
 *
 * O que ele faz, em uma frase: sobe o servidor da Sala de Tela nesta máquina,
 * abre uma janela nele, e quando alguém cria uma sala abre também um endereço
 * público que aponta para cá. Quem cria a sala hospeda a sala.
 *
 * A janela não tem interface própria. Ela carrega o mesmo site que qualquer
 * pessoa abriria pelo link — e é justamente isso que faz quem hospeda ver a
 * sala igualzinho a quem só entrou. O que o app acrescenta são três coisas que
 * uma página não pode fazer sozinha, e elas atravessam o `preload.cjs`: abrir
 * o túnel, copiar para a área de transferência e abrir o navegador.
 *
 * A quarta coisa não atravessa ponte nenhuma, e é a mais importante: aqui
 * dentro `getDisplayMedia()` funciona. No iframe do Discord ele é negado, e foi
 * essa negativa que obrigou a existir uma aba de captura separada — a peça mais
 * confusa do projeto inteiro ("abre uma aba e não acontece nada", diz o
 * README). Dentro do app o seletor de tela abre na própria janela, e a aba
 * simplesmente não é aberta.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BrowserWindow,
  app,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  session,
  shell,
} from 'electron';

import { garantirSegredo } from './config.js';
import { subirServidor } from './servidor.js';
import { criarHospedagem } from './hospedagem.js';
import { abrirTunel } from '../scripts/tunel.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// Duas janelas do app seriam dois servidores e dois túneis, e a segunda pessoa
// a criar sala não entenderia por que a lista está vazia — são processos
// diferentes, e salas vivem em memória. Uma instância só.
if (!app.requestSingleInstanceLock()) app.quit();

/** @type {BrowserWindow | null} */
let janela = null;
let servidor = null;
let hospedagem = null;

// ------------------------------------------------------------ seletor de tela

// O seletor nativo do sistema é o caminho normal no Windows 11 e no macOS
// recente: ele já mostra as janelas com o visual do sistema e é ele quem dá
// acesso ao som da aba escolhida. Onde ele não existe, o Electron chama o
// nosso.
let seletorAberto = false;

/**
 * Pergunta o que mostrar, numa janela nossa.
 *
 * @returns {Promise<Electron.DesktopCapturerSource | null>} null quando a
 * pessoa cancelou.
 */
function pedirFonte(pai) {
  // Um segundo seletor por cima do primeiro deixaria os dois disputando o mesmo
  // canal de IPC, e o primeiro nunca mais receberia resposta.
  if (seletorAberto) return Promise.resolve(null);
  seletorAberto = true;

  return new Promise((resolver) => {
    const escolha = new BrowserWindow({
      parent: pai,
      modal: true,
      width: 900,
      height: 640,
      backgroundColor: '#1e1f22',
      title: 'Escolha o que mostrar',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(AQUI, 'seletor', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    /** As fontes de verdade ficam aqui; a página só recebe id, nome e imagem. */
    let fontes = [];
    let respondido = false;

    const aoEscolher = (_evento, id) => responder(id);

    function responder(id) {
      if (respondido) return;
      respondido = true;

      ipcMain.removeHandler('seletor:listar');
      ipcMain.removeListener('seletor:escolher', aoEscolher);
      seletorAberto = false;
      if (!escolha.isDestroyed()) escolha.destroy();

      resolver(fontes.find((f) => f.id === id) ?? null);
    }

    ipcMain.handle('seletor:listar', async () => {
      fontes = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      });

      return fontes.map((f) => ({
        id: f.id,
        nome: f.name,
        // `screen:` é o prefixo que o próprio Electron usa para monitores.
        tipo: f.id.startsWith('screen:') ? 'tela' : 'janela',
        miniatura: f.thumbnail.toDataURL(),
      }));
    });

    ipcMain.on('seletor:escolher', aoEscolher);

    // Fechar pelo X é cancelar, e precisa ser tratado: sem isto a promessa
    // nunca se resolveria, e a página ficaria esperando um seletor que já não
    // existe.
    escolha.on('closed', () => responder(null));

    escolha.loadFile(path.join(AQUI, 'seletor', 'index.html'));
  });
}

// ------------------------------------------------------------------- arranque

async function abrir() {
  const dados = app.getPath('userData');

  servidor = await subirServidor({
    raiz: app.getAppPath(),
    segredo: garantirSegredo(dados),
    // O próprio Electron rodando como Node: quem instalou o app não tem Node na
    // máquina, e não deveria precisar ter.
    execPath: process.execPath,
    aoFalar: (linha) => console.log(`[servidor] ${linha}`),
    aoMorrer: (codigo) => {
      if (codigo === null) return; // fomos nós que o matamos, ao sair
      dialog.showErrorBox(
        'A Sala de Tela parou',
        'O servidor interno fechou sozinho. Abra o app de novo.',
      );
      app.quit();
    },
  });

  const origemLocal = `http://127.0.0.1:${servidor.porta}`;

  hospedagem = criarHospedagem({
    abrirTunel,
    // A janela precisa saber quando o endereço cai, e isso pode acontecer muito
    // depois de qualquer clique.
    aoMudar: (estado) => janela?.webContents.send('sala:estado', estado),
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    async (_pedido, callback) => {
      const fonte = await pedirFonte(janela);
      // Sem argumento é a recusa: a página recebe NotAllowedError, o mesmo que
      // receberia se a pessoa fechasse o seletor do navegador.
      if (!fonte) return callback();

      // Só vídeo, de propósito. O som de tela inteira entrega a mistura do
      // sistema, com a saída de quem estiver numa call dentro — o mesmo eco que
      // a regra "som só de aba" evita no navegador. Onde o seletor nativo
      // existe, é ele quem oferece o som da aba, e não passa por aqui.
      callback({ video: fonte });
    },
    { useSystemPicker: true },
  );

  janela = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    // A mesma cor de fundo da página, senão a janela pisca branco antes de
    // carregar.
    backgroundColor: '#000000',
    title: 'Sala de Tela',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(AQUI, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--sala-origem=${origemLocal}`],
    },
  });

  janela.once('ready-to-show', () => janela.show());
  janela.on('closed', () => {
    janela = null;
  });

  // Link para fora vai para o navegador da pessoa, nunca para dentro da janela:
  // aqui dentro existem poderes que um site qualquer não pode ter.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    abrirNoNavegador(url);
    return { action: 'deny' };
  });

  janela.webContents.on('will-navigate', (evento, url) => {
    if (mesmaOrigem(url, origemLocal)) return;
    evento.preventDefault();
    abrirNoNavegador(url);
  });

  await janela.loadURL(`${origemLocal}/`);
}

function mesmaOrigem(url, origem) {
  try {
    return new URL(url).origin === origem;
  } catch {
    return false;
  }
}

/** Só http e https: `file:` e `javascript:` abririam coisas desta máquina. */
function abrirNoNavegador(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
  } catch {
    /* não é URL: não há para onde abrir */
  }
}

// --------------------------------------------------------------------- pontes

ipcMain.handle('sala:hospedar', async () => {
  try {
    const origem = await hospedagem.hospedar({
      porta: servidor.porta,
      // Fora do programa: um app instalado mora onde não se escreve, e o
      // cloudflared precisa sobreviver à próxima atualização do app.
      cache: path.join(app.getPath('userData'), 'cloudflared'),
    });

    // A partir daqui todo convite emitido aponta para o túnel. Antes disto eles
    // apontariam para 127.0.0.1, que só abre nesta máquina.
    servidor.avisarOrigem(origem);
  } catch {
    // Não relança: o estado já carrega a explicação, e a janela sabe mostrá-la
    // melhor do que um erro de IPC atravessado.
  }
  return hospedagem.estado();
});

ipcMain.handle('sala:encerrar', () => {
  hospedagem.encerrar();
  // Volta a emitir convites locais. Sem isto, uma sala criada depois de
  // encerrar levaria a um endereço que já não responde.
  servidor.avisarOrigem(`http://127.0.0.1:${servidor.porta}`);
  return hospedagem.estado();
});

ipcMain.handle('sala:estado', () => hospedagem.estado());

ipcMain.handle('sala:copiar', (_evento, texto) => clipboard.writeText(String(texto ?? '')));

ipcMain.handle('sala:abrir-externo', (_evento, url) => abrirNoNavegador(String(url ?? '')));

// ------------------------------------------------------------- ciclo de vida

app.on('second-instance', () => {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.focus();
});

app.whenReady().then(abrir, (err) => {
  dialog.showErrorBox('Não deu para abrir a Sala de Tela', err.message);
  app.quit();
});

app.on('window-all-closed', () => app.quit());

// O túnel e o servidor são processos filhos: sem isto eles sobrevivem ao
// fechamento da janela e ficam no Gerenciador de Tarefas, segurando a porta e
// um endereço público no ar que ninguém mais controla.
app.on('before-quit', () => {
  hospedagem?.encerrar();
  servidor?.encerrar();
});
