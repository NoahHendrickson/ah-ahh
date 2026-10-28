const { app, BrowserWindow, components, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const QRCode = require('qrcode');
const { autoUpdater } = require('electron-updater');
const credentials = require('./credentials');
const prefs = require('./prefs');
const { readToken, resetToken, startRemote } = require('./remote');
const { startServer } = require('./server');

// Fixed port: MusicKit keeps your sign-in in storage scoped to the page origin,
// so the origin (and therefore the port) must stay the same between launches.
const PORT = 10770;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DEV_URL = process.env.AHAHH_DEV_URL;
// The phone remote gets its own server on the LAN, so the app's server above stays local-only.
const REMOTE_PORT = 10771;

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
let remote = null;
let remoteError = null;
let nowPlaying = { playing: false, title: null };

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
ipcMain.handle('musickit:status', () => credentials.status());
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
ipcMain.on('nowplaying', (_event, state) => {
  nowPlaying = state;
  server?.publish(state);
  remote?.publish(state);
});

// Phone remote requests the player answers (the queue, Apple Music API calls), matched up by ID.
const pendingRequests = new Map();
let lastRequestId = 0;
function askPlayer(request) {
  if (!win) return Promise.resolve({ status: 503, body: { error: 'player unavailable' } });
  const id = ++lastRequestId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => reply({ status: 504, body: { error: 'player timed out' } }), 15_000);
    const reply = (answer) => {
      clearTimeout(timer);
      pendingRequests.delete(id);
      resolve(answer);
    };
    pendingRequests.set(id, reply);
    win.webContents.send('remote:request', id, request);
  });
}
ipcMain.on('remote:reply', (event, id, answer) => {
  if (event.sender === win?.webContents) pendingRequests.get(id)?.(answer);
});

// Phone remote. Starts/stops are chained so quick toggles can't overlap.
const tokenFile = () => path.join(app.getPath('userData'), 'remote.json');
let remoteToken = null;
let remoteTask = Promise.resolve();
function setRemote(enabled) {
  remoteTask = remoteTask.then(async () => {
    await remote?.close();
    remote = null;
    remoteError = null;
    if (!enabled) return;
    try {
      remote = await startRemote({
        port: REMOTE_PORT,
        token: (remoteToken ??= readToken(tokenFile())),
        info: { name: os.hostname(), version: app.getVersion() },
        state: nowPlaying,
        command: (cmd) => {
          if (!win) return false;
          win.webContents.send('remote:command', cmd);
          return true;
        },
        request: askPlayer,
      });
    } catch (err) {
      remoteError =
        err.code === 'EADDRINUSE' ? `Port ${REMOTE_PORT} is already in use by another program.` : `Couldn’t start (${err.code || err.message}).`;
    }
  });
  return remoteTask;
}

/** This PC's LAN addresses, for the phone to try in turn. */
function lanHosts() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a.address);
}

async function remotePairing() {
  await remoteTask;
  const enabled = prefs.get().remote;
  if (!remote) return { enabled, error: remoteError };
  const hosts = lanHosts();
  const url = `ahahh://pair?hosts=${hosts.join(',')}&port=${REMOTE_PORT}&token=${remoteToken}&name=${encodeURIComponent(os.hostname())}`;
  return { enabled, url, qr: await QRCode.toDataURL(url, { margin: 2, width: 360 }), hosts, port: REMOTE_PORT, error: null };
}

ipcMain.handle('remote:pairing', remotePairing);
ipcMain.handle('remote:set-enabled', (_event, enabled) => {
  setRemote(prefs.set({ remote: enabled === true }).remote);
  return remotePairing();
});
ipcMain.handle('remote:reset', () => {
  remoteToken = resetToken(tokenFile());
  // Restarting with the new token also drops every phone connected with the old one.
  if (prefs.get().remote) setRemote(true);
  return remotePairing();
});

// Updates come from GitHub Releases: downloaded in the background, installed on quit
// (or right away via "Restart to update" in Settings).
let updateStatus = 'idle';
function setUpdateStatus(status) {
  updateStatus = status;
  win?.webContents.send('update:status', status);
}
// Kept in <userData>/updater.log so a failed update on someone's PC can be diagnosed.
const logUpdate =
  (level) =>
  (...args) => {
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), `${new Date().toISOString()} ${level} ${args.join(' ')}\n`);
    } catch {
      // Logging must never break updating.
    }
  };
autoUpdater.logger = { info: logUpdate('info'), warn: logUpdate('warn'), error: logUpdate('error'), debug() {} };
autoUpdater.on('checking-for-update', () => setUpdateStatus('checking'));
autoUpdater.on('update-available', () => setUpdateStatus('downloading'));
autoUpdater.on('update-not-available', () => setUpdateStatus('latest'));
autoUpdater.on('update-downloaded', () => setUpdateStatus('ready'));
autoUpdater.on('error', (err) => {
  console.error('Update check failed:', err);
  if (updateStatus !== 'ready') setUpdateStatus('error');
});
function checkForUpdates() {
  if (app.isPackaged && ['idle', 'latest', 'error'].includes(updateStatus)) autoUpdater.checkForUpdates().catch(() => {});
}
ipcMain.handle('update:status', () => updateStatus);
ipcMain.handle('update:check', () => checkForUpdates());
// Silent (no installer wizard), then reopen ah ahh once it's installed.
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(true, true));

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

  if (prefs.get().remote) setRemote(true);
  createWindow();
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000);
});
