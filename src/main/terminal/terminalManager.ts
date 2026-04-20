import { randomUUID } from 'node:crypto';
import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import type { TerminalId } from '@shared/domain';
import { TerminalErrorCode } from '@shared/errors';
import { type Result, ok, err } from '@shared/result';
import { IPC } from '@shared/ipc';
import { type TerminalState, canTransition } from './state';
import { KILL_FALLBACK_MS, MAX_WRITE_BYTES } from './constants';
import { toArrayBuffer } from './toArrayBuffer';
import { getCachedClaudeBin } from './resolveClaudeBin';

export class TerminalManager {
  #state: TerminalState = 'idle';
  #pty: IPty | null = null;
  #id: TerminalId | null = null;
  #window: BrowserWindow | null = null;
  #killTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): TerminalState {
    return this.#state;
  }

  #transition(to: TerminalState): void {
    if (!canTransition(this.#state, to)) {
      throw new Error(`[atrium:terminal] illegal state transition: ${this.#state} → ${to}`);
    }
    this.#state = to;
  }

  spawn(args: string[], cwd: string): Result<TerminalId, TerminalErrorCode> {
    if (this.#state !== 'idle') {
      return err(TerminalErrorCode.SPAWN_FAILED, 'terminal not idle — already active or transitioning');
    }
    if (args.length < 1) {
      return err(TerminalErrorCode.SPAWN_FAILED, 'args must not be empty');
    }
    if (typeof cwd !== 'string') {
      return err(TerminalErrorCode.SPAWN_FAILED, 'cwd must be a string');
    }

    this.#transition('spawning');

    // E2E override: replace the first arg (the claude binary) with the fixture.
    const e2eBin = process.env['ATRIUM_E2E_CLAUDE_BIN'];
    let spawnArgs: string[];
    if (e2eBin && process.env['NODE_ENV'] !== 'production' && !app.isPackaged) {
      spawnArgs = [e2eBin, ...args.slice(1)];
    } else if (args[0] === 'claude') {
      // node-pty cannot resolve bare CLI shims (`.cmd` on Windows, etc) via PATH.
      // Swap in the absolute path eagerly resolved at main boot when available.
      const resolved = getCachedClaudeBin();
      spawnArgs = resolved !== null ? [resolved, ...args.slice(1)] : args;
    } else {
      spawnArgs = args;
    }

    let pty: IPty;
    try {
      pty = ptySpawn(spawnArgs[0]!, spawnArgs.slice(1), {
        cwd,
        env: process.env as Record<string, string>,
        cols: 120,
        rows: 30,
        name: 'xterm-256color',
      });
    } catch (e) {
      this.#transition('idle');
      return err(TerminalErrorCode.SPAWN_FAILED, e instanceof Error ? e.message : String(e));
    }

    const id = ('t_' + randomUUID()) as TerminalId;
    this.#pty = pty;
    this.#id = id;

    pty.onData((buf: string) => {
      if (this.#window === null || this.#window.isDestroyed()) return;
      this.#window.webContents.send(IPC.terminal.onData, id, toArrayBuffer(buf));
    });

    pty.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      if (this.#killTimer !== null) {
        clearTimeout(this.#killTimer);
        this.#killTimer = null;
      }
      this.#transition('exited');
      if (this.#window !== null && !this.#window.isDestroyed()) {
        this.#window.webContents.send(IPC.terminal.onExit, id, exitCode ?? null);
      }
    });

    this.#transition('active');
    return ok(id);
  }

  kill(id: TerminalId): Result<void, TerminalErrorCode> {
    if (this.#id !== id || this.#pty === null) {
      return err(TerminalErrorCode.INVALID_HANDLE, 'unknown terminal id');
    }
    if (this.#state !== 'active') {
      return err(TerminalErrorCode.KILL_FAILED, 'terminal not in active state');
    }

    const pty = this.#pty;
    const pid = pty.pid;
    const startMs = Date.now();

    if (process.platform === 'win32') {
      pty.kill();
    } else {
      pty.kill('SIGTERM');
      this.#killTimer = setTimeout(() => {
        const elapsedMs = Date.now() - startMs;
        console.warn(`[atrium:terminal] SIGKILL fallback fired: pid=${pid} elapsedMs=${elapsedMs}`);
        pty.kill('SIGKILL');
      }, KILL_FALLBACK_MS);
    }

    return ok(undefined);
  }

  write(id: TerminalId, data: ArrayBuffer): void {
    if (this.#state !== 'active' || this.#id !== id || this.#pty === null) return;

    if (data.byteLength > MAX_WRITE_BYTES) {
      if (this.#window !== null && !this.#window.isDestroyed()) {
        this.#window.webContents.send(IPC.terminal.onError, id, {
          code: 'WRITE_TOO_LARGE',
          message: `write rejected: ${data.byteLength} bytes exceeds ${MAX_WRITE_BYTES} byte limit`,
        });
      }
      return;
    }

    this.#pty.write(Buffer.from(data).toString('utf8'));
  }

  resize(id: TerminalId, cols: number, rows: number): void {
    if (this.#state !== 'active' || this.#id !== id || this.#pty === null) return;
    this.#pty.resize(cols, rows);
  }

  closeAfterExit(id: TerminalId): Result<void, TerminalErrorCode> {
    if (this.#id !== id) {
      return err(TerminalErrorCode.INVALID_HANDLE, 'unknown terminal id');
    }
    if (this.#state !== 'exited') {
      return err(TerminalErrorCode.KILL_FAILED, 'terminal not in exited state');
    }

    this.#transition('closing');
    try {
      this.#pty?.kill();
    } catch {
      // defensive disposal — ignore errors
    }
    this.#pty = null;
    this.#id = null;
    this.#transition('idle');
    return ok(undefined);
  }

  setWindow(win: BrowserWindow | null): void {
    this.#window = win;
    if (win === null && this.#killTimer !== null) {
      clearTimeout(this.#killTimer);
      this.#killTimer = null;
    }
  }
}
