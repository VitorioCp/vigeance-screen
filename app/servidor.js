/**
 * O servidor da Sala de Tela rodando dentro do app.
 *
 * É o mesmo `server/index.js` de sempre, sem uma linha de diferença — o que
 * muda é quem o liga e como. Três escolhas explicam o resto do arquivo:
 *
 * **Processo separado, não `import`.** O servidor chama `process.exit()` quando
 * o arranque dá errado, e escutando no mesmo processo isso fecharia a janela do
 * app sem nada na tela. Separado, ele morre sozinho e o app tem como contar o
 * que houve.
 *
 * **`fork` e não `spawn`.** O canal de mensagens vem junto, e é por ele que o
 * endereço do túnel chega depois, quando nascer.
 *
 * **Porta 0.** Quem escolhe é o sistema. "A porta 3001 já está sendo usada" era
 * o tropeço mais comum do caminho por terminal, e aqui ele deixa de existir:
 * dois apps abertos ao mesmo tempo pegam portas diferentes sem saber um do
 * outro.
 */
import path from 'node:path';
import { fork as forkPadrao } from 'node:child_process';

// Um servidor que não anuncia a porta em quinze segundos não vai anunciar mais.
// O que sobra é a janela parada num "abrindo…" para sempre, que é pior do que
// um erro dito na cara.
const ESPERA_MS = 15_000;

/**
 * Sobe o servidor e resolve quando ele estiver escutando.
 *
 * @param {object} opcoes
 * @param {string} opcoes.raiz Pasta do projeto, onde mora `server/index.js`.
 * @param {string} opcoes.segredo `SESSION_SECRET`.
 * @param {string} [opcoes.execPath] Binário que roda o servidor. No app é o
 *   próprio Electron, com `ELECTRON_RUN_AS_NODE` — a máquina de quem só baixou
 *   o instalador não tem Node nenhum instalado.
 * @param {(codigo: number | null) => void} [opcoes.aoMorrer]
 * @param {(linha: string) => void} [opcoes.aoFalar]
 * @param {typeof forkPadrao} [opcoes.fork]
 * @returns {Promise<{porta: number, avisarOrigem: (origem: string) => void,
 *   encerrar: () => void}>}
 */
export function subirServidor({
  raiz,
  segredo,
  execPath,
  aoMorrer = () => {},
  aoFalar = () => {},
  fork = forkPadrao,
}) {
  const filho = fork(path.join(raiz, 'server', 'index.js'), [], {
    cwd: raiz,
    execPath,
    // Sem isto o Electron abriria outra janela em vez de rodar o arquivo.
    // Inofensivo quando `execPath` é um Node de verdade, que ignora a variável.
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      SESSION_SECRET: segredo,
      PORT: '0',
      // O servidor sobe antes do túnel existir. Quem assiste ainda não recebeu
      // link nenhum, então não há convite errado a emitir nesse intervalo.
      PUBLIC_ORIGIN: 'http://127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  const falar = (pedaco) => {
    for (const linha of String(pedaco).split('\n')) {
      if (linha.trim()) aoFalar(linha);
    }
  };
  filho.stdout?.on('data', falar);
  filho.stderr?.on('data', falar);

  return new Promise((resolver, rejeitar) => {
    // Uma vez só: `pronto` chega uma vez, mas um servidor que morresse logo
    // depois de anunciar chamaria `rejeitar` sobre uma promessa já resolvida.
    let decidido = false;
    const decidir = (fn) => (valor) => {
      if (decidido) return;
      decidido = true;
      clearTimeout(relogio);
      fn(valor);
    };
    const ok = decidir(resolver);
    const falhou = decidir(rejeitar);

    const relogio = setTimeout(() => {
      filho.kill();
      falhou(new Error('O servidor não respondeu. Feche o app e abra de novo.'));
    }, ESPERA_MS);
    relogio.unref?.();

    filho.on('message', (msg) => {
      if (msg?.tipo !== 'pronto') return;

      ok({
        porta: msg.porta,
        // O servidor carimba o endereço público dentro de cada convite que
        // emite, e o do túnel só existe depois. Esta é a mensagem que o corrige.
        avisarOrigem: (origem) => {
          if (filho.connected) filho.send({ tipo: 'origem', origem });
        },
        encerrar: () => filho.kill(),
      });
    });

    filho.on('error', falhou);

    filho.on('exit', (codigo) => {
      falhou(new Error(`O servidor parou sozinho (código ${codigo}).`));
      aoMorrer(codigo);
    });
  });
}
