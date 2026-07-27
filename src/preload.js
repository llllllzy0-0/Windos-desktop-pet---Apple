const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  move: (dx, dy) => ipcRenderer.send('move-pet', { dx, dy }),
  openWeCom: () => ipcRenderer.send('open-wecom'),
  onAction: callback => ipcRenderer.on('pet-action', (_event, action) => callback(action)),
  onWeComNotification: callback => ipcRenderer.on('wecom-notification', callback)
});
