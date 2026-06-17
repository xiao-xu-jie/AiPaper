// preload.cjs — Electron preload (CJS, contextIsolation: true)
const { contextBridge, shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url) => shell.openExternal(url)
});

