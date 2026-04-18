import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const IS_DEV = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Atrium',
    backgroundColor: '#1e1e1e',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    if (IS_DEV) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (IS_DEV && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
  }

  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
