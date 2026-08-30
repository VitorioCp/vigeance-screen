/**
 * A ponte entre a janela do app e o processo principal.
 *
 * CommonJS porque preload em sandbox não aceita módulo ES, e `.cjs` porque a
 * raiz declara `"type": "module"`.
 *
 * O que passa por aqui é o que a página **não** consegue fazer sozinha: subir
 * um túnel, escrever na área de transferência do sistema, abrir o navegador.
 * Sala, senha, transmissão e tudo o mais continuam sendo HTTP e WebSocket
 * contra o servidor local, como já eram no navegador — o app não é um caminho
 * paralelo, é a mesma página com três poderes a mais.
 */
const { contextBridge, ipcRenderer } = require('electron');

// A origem do servidor local vem por argumento de linha de comando, carimbada
// pelo processo principal em `additionalArguments`.
const esperada = process.argv.find((a) => a.startsWith('--sala-origem='))?.slice(14);

/**
 * A ponte só existe na página que o app serve.
 *
 * Sem esta trava, bastaria a janela navegar para qualquer lugar — um link
 * clicado, um redirecionamento — para um site qualquer da internet poder abrir
 * túneis e ler a área de transferência desta máquina. O `will-navigate` do
 * processo principal já barra a navegação; isto é a segunda tranca, para o dia
 * em que alguém mexer naquela.
 */
if (esperada && location.origin === esperada) {
  contextBridge.exposeInMainWorld('salaDeTela', {
    versao: process.versions.electron,

    /** Abre o endereço público. Devolve o estado — inclusive quando falha. */
    hospedar: () => ipcRenderer.invoke('sala:hospedar'),
    encerrar: () => ipcRenderer.invoke('sala:encerrar'),
    estado: () => ipcRenderer.invoke('sala:estado'),

    /** Abre a sala de outra pessoa numa janela deste app. */
    visitar: (url) => ipcRenderer.invoke('sala:visitar', url),

    /** Avisa a cada mudança de estado. Devolve como parar de ouvir. */
    aoMudarEstado: (callback) => {
      const ouvinte = (_evento, estado) => callback(estado);
      ipcRenderer.on('sala:estado', ouvinte);
      return () => ipcRenderer.removeListener('sala:estado', ouvinte);
    },

    copiar: (texto) => ipcRenderer.invoke('sala:copiar', texto),
    abrirExterno: (url) => ipcRenderer.invoke('sala:abrir-externo', url),
  });
}
