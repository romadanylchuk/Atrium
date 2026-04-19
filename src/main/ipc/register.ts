/**
 * register.ts — single entry point that registers all IPC handlers.
 *
 * Call `registerIpc(getWindow, { terminalManager, watcherManager })` once
 * in src/main/index.ts. The idempotent guard ensures
 * double-registration (e.g. in tests) is a no-op.
 *
 * BrowserWindow is accepted via a getWindow() accessor so tests can pass null
 * without importing BrowserWindow as a value.
 */

import type { BrowserWindow } from 'electron';
import { registerProjectHandlers } from './project';
import { registerDialogHandlers } from './dialog';
import { registerFileSyncHandlers } from './fileSync';
import { registerTerminalHandlers } from './terminal';
import { registerHealthHandlers } from './health';
import { registerLayoutHandlers } from './layout';
import { registerSkillHandlers } from './skill';
import { TerminalManager } from '@main/terminal';
import { WatcherManager } from '@main/fileSync';

// Module-level idempotency guard — reset only possible in tests via the exported setter.
let registered = false;

/** For tests only: reset the idempotency flag so registerIpc can be called again. */
export function __resetRegisteredForTests(): void {
  registered = false;
}

/**
 * Register all IPC handlers for the application.
 *
 * Idempotent: the second and subsequent calls are silent no-ops.
 * This prevents accidental duplicate handler errors in test suites.
 */
export function registerIpc(
  getWindow: () => BrowserWindow | null,
  managers: { terminalManager: TerminalManager; watcherManager: WatcherManager },
): void {
  if (registered) return;
  registered = true;

  const { terminalManager, watcherManager } = managers;

  registerProjectHandlers(watcherManager);
  registerDialogHandlers(getWindow);
  registerFileSyncHandlers(watcherManager);
  registerTerminalHandlers(terminalManager);
  registerHealthHandlers();
  registerLayoutHandlers();
  registerSkillHandlers(terminalManager);
}
