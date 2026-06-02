const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
    loadGCode: () => ipcRenderer.invoke('load-gcode-dialog'),
    onOpenFile: (callback) => ipcRenderer.on('open-file', (event, filePath) => callback(filePath)),
    isElectron: true
});
