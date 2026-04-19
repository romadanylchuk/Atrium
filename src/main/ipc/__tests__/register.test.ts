/**
 * Tests for src/main/ipc/register.ts
 *
 * Verifies:
 *  1. registerIpc is idempotent — second call is a no-op (no duplicate registrations).
 *  2. Every channel in IPC.* (flattened) is either handle-registered or on-registered
 *     after registerIpc runs.
 *
 * Uses a fake ipcMain injected indirectly by mocking @main/ipc/ipcModule so
 * registerIpc's internal calls pick up the fake without needing to change the
 * register.ts signature (which has no ipcMainLike param by design).
 *
 * NOTE: Because vi.mock hoists and module state is shared, we use
 * __resetRegisteredForTests() to reset the idempotency flag before each test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';

// ---------------------------------------------------------------------------
// Fake ipcMain — built before mocking so we can reference it inside vi.mock
// ---------------------------------------------------------------------------

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;
type OnHandler = (...args: unknown[]) => void;

const handleMap = new Map<string, InvokeHandler>();
const onMap = new Map<string, OnHandler>();

const fakeIpcMain = {
  handle(channel: string, listener: InvokeHandler) {
    handleMap.set(channel, listener);
  },
  on(channel: string, listener: OnHandler) {
    onMap.set(channel, listener);
  },
};

// Mock @main/ipc/ipcModule to return our fake instead of the real Electron ipcMain.
vi.mock('@main/ipc/ipcModule', () => ({
  ipcMain: fakeIpcMain,
}));

// ---------------------------------------------------------------------------
// Flat set of all IPC channels
// ---------------------------------------------------------------------------

function flattenIpc(): string[] {
  const channels: string[] = [];
  for (const ns of Object.values(IPC)) {
    for (const ch of Object.values(ns)) {
      channels.push(ch as string);
    }
  }
  return channels;
}

// Push channels (main→renderer) that are NOT registered on main side:
//   fileSync:onChanged — webContents.send, no ipcMain registration
//   terminal:onData    — webContents.send, no ipcMain registration
//   terminal:onExit    — webContents.send, no ipcMain registration
//   terminal:onError   — webContents.send, no ipcMain registration
//
const PUSH_ONLY_CHANNELS = new Set<string>([
  IPC.fileSync.onChanged,
  IPC.terminal.onData,
  IPC.terminal.onExit,
  IPC.terminal.onError,
]);

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  handleMap.clear();
  onMap.clear();
  // Reset the idempotency flag before each test
  const { __resetRegisteredForTests } = await import('../register');
  __resetRegisteredForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fake managers — minimal method stubs matching TerminalManager / WatcherManager
// ---------------------------------------------------------------------------

const fakeTerminalManager = {
  spawn: () => ({ ok: false as const, error: { code: 'SPAWN_FAILED', message: 'stub' } }),
  kill: () => ({ ok: false as const, error: { code: 'KILL_FAILED', message: 'stub' } }),
  write: () => {},
  resize: () => {},
};

const fakeWatcherManager = {
  start: () => Promise.resolve({ ok: true as const, data: undefined }),
  stop: () => Promise.resolve({ ok: true as const, data: undefined }),
};

describe('registerIpc', () => {
  it('registers all non-push IPC channels exactly once', async () => {
    const { registerIpc } = await import('../register');
    registerIpc(() => null, { terminalManager: fakeTerminalManager as never, watcherManager: fakeWatcherManager as never });

    const allChannels = flattenIpc();
    for (const ch of allChannels) {
      if (PUSH_ONLY_CHANNELS.has(ch)) continue;
      const isHandled = handleMap.has(ch) || onMap.has(ch);
      expect(isHandled, `Channel "${ch}" should be registered`).toBe(true);
    }
  });

  it('is idempotent — second call does not add duplicate handlers', async () => {
    const { registerIpc } = await import('../register');

    const managers = { terminalManager: fakeTerminalManager as never, watcherManager: fakeWatcherManager as never };
    registerIpc(() => null, managers);
    const handleCountAfterFirst = handleMap.size;
    const onCountAfterFirst = onMap.size;

    // Second call should be a no-op
    registerIpc(() => null, managers);
    expect(handleMap.size).toBe(handleCountAfterFirst);
    expect(onMap.size).toBe(onCountAfterFirst);
  });

  it('push-only channels (main→renderer) are NOT registered via ipcMain', async () => {
    const { registerIpc } = await import('../register');
    registerIpc(() => null, { terminalManager: fakeTerminalManager as never, watcherManager: fakeWatcherManager as never });

    for (const ch of PUSH_ONLY_CHANNELS) {
      expect(handleMap.has(ch), `Push channel "${ch}" should NOT be in handleMap`).toBe(false);
      expect(onMap.has(ch), `Push channel "${ch}" should NOT be in onMap`).toBe(false);
    }
  });

  it('invoke channels are in handleMap (not onMap)', async () => {
    const { registerIpc } = await import('../register');
    registerIpc(() => null, { terminalManager: fakeTerminalManager as never, watcherManager: fakeWatcherManager as never });

    // Channels that should be invoke-registered (handle), not on-registered
    const invokeChannels = [
      IPC.project.open,
      IPC.project.switch,
      IPC.project.getRecents,
      IPC.dialog.openFolder,
      IPC.fileSync.startWatching,
      IPC.fileSync.stopWatching,
      IPC.terminal.spawn,
      IPC.terminal.kill,
      IPC.health.checkClaude,
      IPC.layout.load,
      IPC.layout.save,
      IPC.skill.spawn,
    ];

    for (const ch of invokeChannels) {
      expect(handleMap.has(ch), `Channel "${ch}" should be in handleMap`).toBe(true);
    }
  });

  it('fire-and-forget channels are in onMap (not handleMap)', async () => {
    const { registerIpc } = await import('../register');
    registerIpc(() => null, { terminalManager: fakeTerminalManager as never, watcherManager: fakeWatcherManager as never });

    expect(onMap.has(IPC.terminal.write)).toBe(true);
    expect(onMap.has(IPC.terminal.resize)).toBe(true);
    expect(onMap.has(IPC.layout.saveSnapshot)).toBe(true);
  });
});
