const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Keep the existing game logins and browser data after the product rename.
app.setPath('userData', path.join(app.getPath('appData'), 'Haven Flash Browser'));

const FLASH_VERSION = '29.0.0.171';
const REPOSITORY_URL = 'https://github.com/Yinglianchun/rainport-flash';
const flashPath = path.join(process.resourcesPath, 'libs', 'pepflashplayer64.dll');

if (!fs.existsSync(flashPath)) {
  throw new Error(`Flash Player not found: ${flashPath}`);
}

app.commandLine.appendSwitch('ppapi-flash-path', flashPath);
app.commandLine.appendSwitch('ppapi-flash-version', FLASH_VERSION);
app.commandLine.appendSwitch('allow-outdated-plugins');
app.commandLine.appendSwitch('always-authorize-plugins');

let mainWindow;
let gameGuestContents;
let capturingScreenshot = false;

ipcMain.on('toggle-fullscreen', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.setFullScreen(!window.isFullScreen());
});

ipcMain.on('close-window', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.close();
});

ipcMain.on('minimize-window', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.minimize();
});

ipcMain.on('toggle-maximize-window', event => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});

ipcMain.on('open-repository', () => {
  shell.openExternal(REPOSITORY_URL);
});

ipcMain.handle('clear-browser-data', async (_event, options = {}) => {
  const gameSession = session.fromPartition('persist:haven-flash');
  if (options.cache) await gameSession.clearCache();
  if (options.cookies) {
    await gameSession.clearStorageData({ storages: ['cookies'] });
  }
  return true;
});

ipcMain.handle('export-bookmarks', async (_event, bookmarks) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出收藏夹',
    defaultPath: path.join(app.getPath('documents'), 'Rainport-收藏夹.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(bookmarks, null, 2), 'utf8');
  return { canceled: false };
});

ipcMain.handle('import-bookmarks', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入收藏夹',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const bookmarks = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
  if (!Array.isArray(bookmarks)) throw new Error('收藏夹文件格式不正确');
  return { canceled: false, bookmarks };
});

ipcMain.handle('save-game-screenshot', async (_event, capture) => {
  if (!gameGuestContents || gameGuestContents.isDestroyed()) {
    throw new Error('游戏页面还没有准备好');
  }

  const baseWidth = Math.max(1, Math.round(Number(capture.width) || 0));
  const baseHeight = Math.max(1, Math.round(Number(capture.height) || 0));
  const zoom = Math.max(0.5, Math.min(3, Number(capture.zoom) || 1));
  const outputWidth = Math.round(baseWidth * zoom);
  const outputHeight = Math.round(baseHeight * zoom);
  const chromeWidth = Math.max(0, Math.round(Number(capture.chromeWidth) || 0));
  const chromeHeight = Math.max(0, Math.round(Number(capture.chromeHeight) || 0));
  const previousZoom = gameGuestContents.getZoomFactor();
  const previousBounds = mainWindow.getBounds();
  const wasMaximized = mainWindow.isMaximized();
  const wasFullScreen = mainWindow.isFullScreen();
  let png;

  capturingScreenshot = true;
  try {
    if (wasFullScreen) mainWindow.setFullScreen(false);
    if (wasMaximized) mainWindow.unmaximize();
    await new Promise(resolve => setTimeout(resolve, 100));

    mainWindow.setBounds({
      x: previousBounds.x,
      y: previousBounds.y,
      width: outputWidth + chromeWidth,
      height: outputHeight + chromeHeight
    }, false);
    gameGuestContents.setZoomFactor(1);
    await gameGuestContents.executeJavaScript(capture.layoutScript);
    await new Promise(resolve => setTimeout(resolve, 500));

    const screenshot = await gameGuestContents.capturePage({
      x: 0,
      y: 0,
      width: outputWidth,
      height: outputHeight
    });
    png = screenshot.toPNG();
  } finally {
    gameGuestContents.setZoomFactor(previousZoom);
    mainWindow.setBounds(previousBounds, false);
    if (wasMaximized) mainWindow.maximize();
    if (wasFullScreen) mainWindow.setFullScreen(true);
    await new Promise(resolve => setTimeout(resolve, 160));
    try {
      await gameGuestContents.executeJavaScript(capture.restoreScript);
    } catch (_error) {}
    capturingScreenshot = false;
  }

  if (!png || !png.length) throw new Error('没有截取到游戏画面');

  const safeTitle = String(capture.pageTitle || 'Flash游戏')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 48) || 'Flash游戏';
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存游戏截图',
    defaultPath: path.join(app.getPath('pictures'), `${safeTitle}-${stamp}.png`),
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, png);
  return { canceled: false, filePath: result.filePath, width: outputWidth, height: outputHeight };
});

function bindFullscreenKeys(contents, window) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (input.key === 'Escape' && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
    } else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 's') {
      event.preventDefault();
      window.webContents.send('capture-game-requested');
    }
  });
}

function isAuthenticationPopup({ url, frameName = '' }) {
  if (url === 'about:blank') return true;
  if (/login|oauth|auth|passport|connect|ptlogin/i.test(`${url} ${frameName}`)) return true;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'qq.com' || hostname.endsWith('.qq.com');
  } catch (_error) {
    return false;
  }
}

function configureGuestWindowHandling(guestContents, window) {
  bindFullscreenKeys(guestContents, window);

  if (typeof guestContents.setWindowOpenHandler === 'function') {
    guestContents.setWindowOpenHandler(details => {
      if (isAuthenticationPopup(details)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 720,
            height: 800,
            minWidth: 460,
            minHeight: 560,
            parent: window,
            autoHideMenuBar: true,
            backgroundColor: '#ffffff',
            icon: path.join(__dirname, 'assets', 'samewindow.ico')
          }
        };
      }

      if (/^https?:\/\//i.test(details.url)) {
        window.webContents.send('open-in-current', details.url);
      }
      return { action: 'deny' };
    });
    return;
  }

  guestContents.on('new-window', (event, url, frameName) => {
    if (isAuthenticationPopup({ url, frameName })) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) window.webContents.send('open-in-current', url);
  });
}

function createWindow() {
  const initialUrl = process.env.HAVEN_FLASH_START_URL
    || process.argv.find(argument => /^https?:\/\//i.test(argument))
    || '';
  const gameSession = session.fromPartition('persist:haven-flash');

  gameSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'plugins' || permission === 'fullscreen' || permission === 'pointerLock';
  });
  gameSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'plugins' || permission === 'fullscreen' || permission === 'pointerLock');
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#f7f7f5',
    title: 'Rainport',
    icon: path.join(__dirname, 'assets', 'samewindow.ico'),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      backgroundThrottling: false,
      enableRemoteModule: false,
      spellcheck: false
    }
  });

  bindFullscreenKeys(mainWindow.webContents, mainWindow);
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    webPreferences.nativeWindowOpen = true;
  });
  mainWindow.webContents.on('did-attach-webview', (_event, guestContents) => {
    gameGuestContents = guestContents;
    guestContents.once('destroyed', () => {
      if (gameGuestContents === guestContents) gameGuestContents = null;
    });
    configureGuestWindowHandling(guestContents, mainWindow);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'), {
    query: initialUrl ? { url: initialUrl } : undefined
  });

  mainWindow.on('enter-full-screen', () => {
    if (capturingScreenshot) return;
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    if (capturingScreenshot) return;
    mainWindow.webContents.send('fullscreen-changed', false);
  });
  mainWindow.on('maximize', () => {
    if (capturingScreenshot) return;
    mainWindow.webContents.send('maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    if (capturingScreenshot) return;
    mainWindow.webContents.send('maximized-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
