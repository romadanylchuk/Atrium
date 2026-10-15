/**
 * crashLog.ts — persistent diagnostics so a crash leaves something to read afterwards.
 *
 * Everything goes to `<logs>/main.log` (Windows: %APPDATA%\Atrium\logs, macOS:
 * ~/Library/Logs/Atrium, Linux: ~/.config/Atrium/logs), rotated to `main.old.log` at startup
 * once it passes MAX_LOG_BYTES. Captured:
 *   - main-process console.warn / console.error (all existing `[atrium:*]` warnings)
 *   - uncaught exceptions and unhandled promise rejections in main
 *   - renderer crashes / kills / OOMs, hangs, failed loads, preload errors
 *   - renderer console errors, which include uncaught errors and React render failures
 *   - GPU / utility process crashes
 * Native crashes additionally produce minidumps via Electron's crashReporter (local only).
 *
 * Writes are synchronous on purpose: the process may be about to die.
 */

import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';

export const LOG_FILE = 'main.log';
export const OLD_LOG_FILE = 'main.old.log';
export const MAX_LOG_BYTES = 5 * 1024 * 1024;

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export class CrashLog {
  readonly file: string;

  constructor(readonly dir: string) {
    this.file = path.join(dir, LOG_FILE);
    try {
      fs.mkdirSync(dir, { recursive: true });
      if ((fs.statSync(this.file, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES) {
        fs.renameSync(this.file, path.join(dir, OLD_LOG_FILE));
      }
    } catch {
      // Logging must never be the thing that breaks the app.
    }
  }

  write(level: LogLevel, scope: string, ...args: unknown[]): void {
    const text = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : a));
    const line = `${new Date().toISOString()} ${level.padEnd(5)} [${scope}] ${format(...text)}\n`;
    try {
      fs.appendFileSync(this.file, line);
    } catch {
      // ignore — see constructor
    }
  }
}

/** Copy console.warn / console.error into the log while keeping their normal output. */
export function mirrorConsole(log: CrashLog, target: Pick<Console, 'warn' | 'error'> = console): void {
  const { warn, error } = target;
  target.warn = (...args: unknown[]) => {
    log.write('WARN', 'console', ...args);
    warn.apply(target, args);
  };
  target.error = (...args: unknown[]) => {
    log.write('ERROR', 'console', ...args);
    error.apply(target, args);
  };
}
