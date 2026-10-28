const { app, BrowserWindow, components, dialog, ipcMain, nativeTheme, shell } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const credentials = require('./credentials');
const prefs = require('./prefs');
const { startServer } = require('./server');

// Fixed port: MusicKit keeps your sign-in in storage scoped to the page origin,
// so the origin (and therefore the port) must stay the same between launches.
const PORT = 10770;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DEV_URL = process.env.AHAHH_DEV_URL;

// Apple's sign-in pages are picky about unfamiliar browsers; present as plain Chrome.
// Electron adds "<app name without spaces>/<version>" to the user agent.
const appNamePattern = app.getName().replace(/\s+/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
app.userAgentFallback = app.userAgentFallback.replace(new RegExp(` (Electron|${appNamePattern})/\\S+`, 'gi'), '');

if (!app.requestSingleInstanceLock()) app.quit();

// The UI is dark-only; this also makes the frosted glass material dark on both platforms.
nativeTheme.themeSource = 'dark';

/** Popups MusicKit opens for Apple ID sign-in. Everything else opens in the real browser. */
const SIGN_IN_HOSTS = new Set(['authorize.music.apple.com', 'idmsa.apple.com', 'appleid.apple.com']);

let win = null;
let server = null;

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isAppUrl(url) {
  return url.startsWith(ORIGIN) || (DEV_URL && url.startsWith(DEV_URL));
}

/** Turns the frosted-glass window background on/off (the page's CSS supplies the tint on top). */
function applyGlass(window, enabled) {
  if (process.platform === 'darwin') window.setVibrancy(enabled ? 'under-window' : null);
  else if (process.platform === 'win32') window.setBackgroundMaterial(enabled ? 'acrylic' : 'none');
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  // When glass is possible, keep the window itself transparent so it can be toggled live;
  // with glass off, the page paints a solid background instead.
  const canGlass = prefs.glassSupported();
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    backgroundColor: canGlass ? '#00000000' : '#0e0e11',
    title: 'ah ahh',
    titleBarStyle: 'hidden',
    ...(isMac
      ? {
          trafficLightPosition: { x: 18, y: 18 },
          visualEffectState: 'active',
          // Required for a see-through background; without it old frames smear ("ghosting").
          transparent: canGlass,
        }
      : { titleBarOverlay: { color: canGlass ? '#00000000' : '#141418', symbolColor: '#e8e8ea', height: 48 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (SIGN_IN_HOSTS.has(hostOf(url))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          titleBarStyle: 'default',
          titleBarOverlay: false,
        },
      };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  if (canGlass && prefs.get().glass) applyGlass(win, true);
  win.loadURL(DEV_URL || `${ORIGIN}/`);
  win.on('closed', () => (win = null));
}

ipcMain.handle('musickit:token', () => credentials.developerToken());
ipcMain.handle('musickit:save', (_event, creds) => credentials.save(creds));
ipcMain.handle('musickit:reset', () => credentials.clear());
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  overlayUrl: `${ORIGIN}/overlay`,
  nowPlayingTextUrl: `${ORIGIN}/now-playing.txt`,
  widevine: components.status(),
}));
const currentPrefs = () => ({ ...prefs.get(), glassSupported: prefs.glassSupported() });
ipcMain.handle('prefs:get', currentPrefs);
ipcMain.on('prefs:get-sync', (event) => {
  event.returnValue = currentPrefs();
});
ipcMain.handle('prefs:set', (_event, patch) => {
  const before = prefs.get().glass;
  const next = prefs.set(patch);
  if (win && prefs.glassSupported() && next.glass !== before) applyGlass(win, next.glass);
  return { ...next, glassSupported: prefs.glassSupported() };
});
ipcMain.on('nowplaying', (_event, state) => server?.publish(state));

// Updates come from GitHub Releases: downloaded in the background, installed on quit
// (or right away via "Restart to update" in Settings).
let updateStatus = 'idle';
function setUpdateStatus(status) {
  updateStatus = status;
  win?.webContents.send('update:status', status);
}
autoUpdater.on('update-available', () => setUpdateStatus('downloading'));
autoUpdater.on('update-not-available', () => setUpdateStatus('latest'));
autoUpdater.on('update-downloaded', () => setUpdateStatus('ready'));
autoUpdater.on('error', (err) => {
  console.error('Update check failed:', err);
  if (updateStatus !== 'ready') setUpdateStatus('error');
});
function checkForUpdates() {
  if (app.isPackaged && updateStatus !== 'ready') autoUpdater.checkForUpdates().catch(() => {});
}
ipcMain.handle('update:status', () => updateStatus);
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  try {
    // Downloads/updates the Widevine CDM on first launch. Required for Apple Music playback.
    await components.whenReady();
  } catch (err) {
    console.error('Widevine failed to initialize:', err);
  }

  try {
    server = await startServer({
      port: PORT,
      rendererDir: path.join(__dirname, '..', 'dist', 'renderer'),
      overlayFile: path.join(__dirname, 'overlay.html'),
    });
  } catch (err) {
    dialog.showErrorBox(
      'ah ahh could not start',
      `Port ${PORT} is already in use (${err.code || err.message}). Close whatever is using it and try again.`,
    );
    app.quit();
    return;
  }

  createWindow();
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
});
