const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  beginDrag: (x, y) => ipcRenderer.send('begin-drag', { x, y }),
  drag: (x, y) => ipcRenderer.send('drag-pet', { x, y }),
  endDrag: () => ipcRenderer.send('end-drag'),
  openWeCom: () => ipcRenderer.send('open-wecom'),
  onAction: callback => ipcRenderer.on('pet-action', (_event, action) => callback(action)),
  onWeComNotification: callback => ipcRenderer.on('wecom-notification', callback)
});
