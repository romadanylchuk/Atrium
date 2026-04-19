import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { applyFixPath } from '@main/boot';
import { registerIpc } from '@main/ipc';
import { getProjectsDir } from '@main/storage';
import { TerminalManager } from '@main/terminal';
import { WatcherManager } from '@main/fileSync';
import { readAndAssembleProject } from '@main/project';
import { flushLayoutBuffer } from '@main/ipc/flushLayoutBuffer';

applyFixPath();

export { flushLayoutBuffer };

const watcherReparseAdapter = async (dir: string) => {
  const projectRoot = path.dirname(dir);
  const r = await readAndAssembleProject(projectRoot);
  return r.ok ? r.data : null;
};

const terminalManager = new TerminalManager();
const watcherManager = new WatcherManager({ onReparse: watcherReparseAdapter });

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

  terminalManager.setWindow(win);
  watcherManager.setWindow(win);

  win.once('ready-to-show', () => {
    win.show();
    // Skip devtools in E2E to avoid Playwright picking up the devtools window as firstWindow().
    if (IS_DEV && !process.env['ATRIUM_E2E_CLAUDE_BIN']) {
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
    terminalManager.setWindow(null);
    watcherManager.setWindow(null);
    void watcherManager.stop(); // fire-and-forget — unsubscribe at quit, no need to await
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

  // Register IPC handlers before app.whenReady() so that handlers are in place
  // before the renderer's loadURL can dispatch its first IPC call.
  registerIpc(() => mainWindow, { terminalManager, watcherManager });

  void app.whenReady().then(async () => {
    // Ensure the projects directory exists before any layout.ts call races it.
    // Fire-and-forget-with-warn: a userData write failure must NOT prevent startup.
    await fs
      .mkdir(getProjectsDir(), { recursive: true })
      .catch((err: unknown) =>
        console.warn('[atrium:storage] failed to pre-create projects dir:', err),
      );

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

  let flushedOnce = false;
  app.on('before-quit', (event) => {
    if (flushedOnce) return;
    flushedOnce = true;
    event.preventDefault();
    flushLayoutBuffer()
      .catch((err: unknown) => console.warn('[atrium:quit] layout flush failed:', err))
      .finally(() => app.exit());
  });
}
