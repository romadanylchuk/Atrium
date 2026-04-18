/**
 * showOpenFolder.ts — Wraps Electron's dialog.showOpenDialog with a Result envelope.
 *
 * - User cancels (canceled === true or empty filePaths) → Result.ok(null).
 * - User picks a directory → Result.ok(path).
 * - OS dialog failure (exception) → Result.err(DialogErrorCode.DIALOG_FAILED, message).
 *
 * This function cannot be unit-tested headlessly; it is an integration-smoke concern
 * covered manually during Phase 7 DevTools sanity checks.
 */

import { dialog, BrowserWindow } from 'electron';
import { type Result, ok, err } from '@shared/result';
import { DialogErrorCode } from '@shared/errors';

/**
 * Show the OS native folder-picker dialog.
 *
 * @param window - The owning BrowserWindow, or null for a top-level dialog.
 * @returns Result.ok(path) if a folder was chosen; Result.ok(null) if cancelled;
 *          Result.err(DIALOG_FAILED) on OS failure.
 */
export async function showOpenFolder(
  window: BrowserWindow | null,
): Promise<Result<string | null, DialogErrorCode>> {
  try {
    // Electron's showOpenDialog has two overloads:
    //   showOpenDialog(window, options) — window-parented
    //   showOpenDialog(options)         — top-level (no owner window)
    // We call the appropriate overload based on whether a window is provided.
    const dialogResult =
      window !== null
        ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });

    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return ok(null);
    }

    const chosen = dialogResult.filePaths[0];
    if (chosen === undefined) {
      return ok(null);
    }

    return ok(chosen);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(DialogErrorCode.DIALOG_FAILED, `Dialog failed: ${msg}`);
  }
}
