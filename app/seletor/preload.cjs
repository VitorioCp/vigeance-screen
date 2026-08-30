/**
 * A ponte da janela do seletor.
 *
 * CommonJS porque preload em sandbox não aceita módulo ES, e `.cjs` porque o
 * package.json da raiz declara `"type": "module"` — sem a extensão, o Node
 * leria este arquivo como ESM e o `require` daqui seria erro de sintaxe.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seletor', {
  listar: () => ipcRenderer.invoke('seletor:listar'),
  escolher: (id) => ipcRenderer.send('seletor:escolher', id),
  cancelar: () => ipcRenderer.send('seletor:escolher', null),
});
