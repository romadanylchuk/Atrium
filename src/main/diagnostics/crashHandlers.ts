/**
 * crashHandlers.ts — hooks every crash / failure signal Electron exposes into the CrashLog.
 * See crashLog.ts for what ends up where.
 */

import { app, crashReporter, dialog, type BrowserWindow } from 'electron';
import os from 'node:os';
import { CrashLog, mirrorConsole } from './crashLog';

let log: CrashLog | null = null;

export function getCrashLog(): CrashLog | null {
  return log;
}

/** Call as early as possible in main, before anything that might throw. */
export function installCrashHandlers(): CrashLog {
  if (log) return log;
  const crashLog = new CrashLog(app.getPath('logs'));
  log = crashLog;

  // Native crashes (main, renderer, GPU) → minidumps in app.getPath('crashDumps'). Local only.
  try {
    crashReporter.start({ uploadToServer: false });
  } catch (e) {
    crashLog.write('WARN', 'crashReporter', 'failed to start:', e);
  }

  mirrorConsole(crashLog);

  crashLog.write(
    'INFO',
    'session',
    `Atrium ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'dev'}) started —`,
    `electron ${process.versions.electron}, chrome ${process.versions.chrome}, node ${process.versions.node},`,
    `${process.platform} ${os.release()} ${process.arch}, pid ${process.pid}`,
  );
  crashLog.write('INFO', 'session', `minidumps: ${app.getPath('crashDumps')}`);

  let fatalShown = false;
  process.on('uncaughtException', (err) => {
    crashLog.write('FATAL', 'main:uncaughtException', err);
    // Replaces Electron's default error box, which shows the stack but loses it on close.
    if (!fatalShown && app.isReady()) {
      fatalShown = true;
      dialog.showErrorBox(
        'Atrium hit an unexpected error',
        `${err instanceof Error ? err.message : String(err)}\n\nDetails were saved to:\n${crashLog.file}`,
      );
    }
  });
  process.on('unhandledRejection', (reason) => {
    crashLog.write('ERROR', 'main:unhandledRejection', reason);
  });

  app.on('render-process-gone', (_event, contents, details) => {
    crashLog.write(
      'FATAL',
      'renderer:gone',
      `reason=${details.reason} exitCode=${details.exitCode} url=${contents.getURL()}`,
    );
  });
  app.on('child-process-gone', (_event, details) => {
    crashLog.write(
      details.reason === 'clean-exit' ? 'INFO' : 'ERROR',
      'child:gone',
      `type=${details.type} reason=${details.reason} exitCode=${details.exitCode}` +
        (details.name ? ` name=${details.name}` : '') +
        (details.serviceName ? ` service=${details.serviceName}` : ''),
    );
  });
  app.on('will-quit', () => crashLog.write('INFO', 'session', 'quitting normally'));

  return crashLog;
}

/** Per-window signals: renderer errors, hangs, failed loads, and recovery after a renderer crash. */
export function watchWindow(win: BrowserWindow): void {
  const crashLog = log;
  if (!crashLog) return;
  const wc = win.webContents;

  // Uncaught renderer errors, unhandled rejections and React's render errors all reach the
  // console, so this captures them without any renderer-side plumbing.
  wc.on('console-message', (event) => {
    if (event.level !== 'error') return;
    crashLog.write('ERROR', 'renderer:console', `${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  wc.on('preload-error', (_event, preloadPath, error) => {
    crashLog.write('ERROR', 'renderer:preload', preloadPath, error);
  });
  wc.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) crashLog.write('ERROR', 'renderer:load', `${code} ${description} url=${url}`);
  });
  win.on('unresponsive', () => crashLog.write('WARN', 'renderer:hang', 'window became unresponsive'));
  win.on('responsive', () => crashLog.write('INFO', 'renderer:hang', 'window responsive again'));

  wc.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'error',
      title: 'Atrium',
      message: 'The Atrium window crashed.',
      detail: `Reason: ${details.reason} (exit code ${details.exitCode}).\n\nDetails were saved to:\n${crashLog.file}`,
      buttons: ['Reload', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0 && !win.isDestroyed()) wc.reload();
    else app.quit();
  });
}
