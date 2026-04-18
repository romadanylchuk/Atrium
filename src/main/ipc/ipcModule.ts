/**
 * ipcModule.ts — thin re-export of ipcMain from Electron.
 *
 * Purpose: isolate the Electron import so Vitest can `vi.mock('@main/ipc/ipcModule')`
 * in tests without pulling the full Electron runtime into the node test environment.
 *
 * Handler files MUST import ipcMain from here, NEVER from 'electron' directly.
 */

export { ipcMain } from 'electron';
