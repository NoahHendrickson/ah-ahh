const { contextBridge, ipcRenderer } = require('electron');

// Only the app's own pages get the bridge, not Apple's sign-in popup.
if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
  contextBridge.exposeInMainWorld('ahahh', {
    platform: process.platform,
    // Read synchronously so the renderer can apply glass before its first paint.
    prefs: ipcRenderer.sendSync('prefs:get-sync'),
    getDeveloperToken: () => ipcRenderer.invoke('musickit:token'),
    saveCredentials: (creds) => ipcRenderer.invoke('musickit:save', creds),
    resetCredentials: () => ipcRenderer.invoke('musickit:reset'),
    getInfo: () => ipcRenderer.invoke('app:info'),
    getPrefs: () => ipcRenderer.invoke('prefs:get'),
    setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
    publishNowPlaying: (state) => ipcRenderer.send('nowplaying', state),
  });
}
