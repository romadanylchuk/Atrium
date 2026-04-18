/**
 * Preload runtime tests — Phase 8
 *
 * Tests listener identity (subscribe/unsubscribe function reference),
 * ArrayBuffer wrapper fidelity, and send-vs-invoke channel dispatch.
 *
 * Strategy: vi.mock('electron') provides a fake ipcRenderer with vi.fn spies.
 * Because the preload module calls contextBridge.exposeInMainWorld at import
 * time we use vi.mock to intercept before the module loads, then capture the
 * `api` object by intercepting the call to exposeInMainWorld.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IPC } from '@shared/ipc';
import type { ProjectState, TerminalId } from '@shared/index';

// ---------------------------------------------------------------------------
// Mock electron BEFORE any import of the preload module
// ---------------------------------------------------------------------------

const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
const mockInvoke = vi.fn();
const mockSend = vi.fn();

// Capture the api object passed to exposeInMainWorld
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedApi: Record<string, any> | null = null;
const mockExposeInMainWorld = vi.fn((_key: string, api: unknown) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  capturedApi = api as Record<string, any>;
});

vi.mock('electron', () => ({
  ipcRenderer: {
    on: mockOn,
    removeListener: mockRemoveListener,
    invoke: mockInvoke,
    send: mockSend,
  },
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
}));

// ---------------------------------------------------------------------------
// Load the preload module AFTER mocks are in place.
// ---------------------------------------------------------------------------

let preloadImported = false;

async function ensurePreloadImported(): Promise<void> {
  if (!preloadImported) {
    await import('../index');
    preloadImported = true;
  }
}

beforeEach(() => {
  mockOn.mockClear();
  mockRemoveListener.mockClear();
  mockInvoke.mockClear();
  mockSend.mockClear();
});

// ---------------------------------------------------------------------------
// Listener identity tests
// ---------------------------------------------------------------------------

describe('Preload listener identity — fileSync.onChanged', () => {
  it('removeListener is called with the EXACT same function reference passed to ipcRenderer.on', async () => {
    await ensurePreloadImported();
    expect(capturedApi).not.toBeNull();

    // cb type is inferred from context; the parameter is intentionally unused
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cb = vi.fn((_state: ProjectState): void => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileSyncApi = capturedApi!['fileSync'] as { onChanged: (cb: any) => () => void };
    const unsubscribe = fileSyncApi.onChanged(cb);

    // ipcRenderer.on must have been called once
    expect(mockOn).toHaveBeenCalledTimes(1);
    const onCalls = mockOn.mock.calls as [string, unknown][];
    const firstOnCall = onCalls[0]!;
    const onChannel = firstOnCall[0];
    const listenerPassedToOn = firstOnCall[1];
    expect(onChannel).toBe(IPC.fileSync.onChanged);

    // Call unsubscribe
    unsubscribe();

    // removeListener must have been called with the SAME function reference
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    const offCalls = mockRemoveListener.mock.calls as [string, unknown][];
    const firstOffCall = offCalls[0]!;
    const offChannel = firstOffCall[0];
    const listenerPassedToOff = firstOffCall[1];
    expect(offChannel).toBe(IPC.fileSync.onChanged);
    expect(listenerPassedToOff).toBe(listenerPassedToOn); // identity — not a copy
  });
});

describe('Preload listener identity — terminal.onData (with id filter)', () => {
  it('removeListener uses the same function reference; mismatched id does not fire callback', async () => {
    await ensurePreloadImported();

    const myId = 'term-abc' as TerminalId;
    const otherId = 'term-xyz' as TerminalId;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cb = vi.fn((_data: ArrayBuffer) => {});

    mockOn.mockClear();
    mockRemoveListener.mockClear();

    const terminalApi = capturedApi!['terminal'] as {
      onData: (id: TerminalId, cb: (data: ArrayBuffer) => void) => () => void;
    };
    const unsubscribe = terminalApi.onData(myId, cb);

    expect(mockOn).toHaveBeenCalledTimes(1);
    const onCalls = mockOn.mock.calls as [string, (event: unknown, ...args: unknown[]) => void][];
    const firstOnCall = onCalls[0]!;
    const listenerPassedToOn = firstOnCall[1];

    // Simulate an event with a DIFFERENT id — callback must NOT fire
    const fakeEvent = {};
    const differentIdBuffer = new ArrayBuffer(4);
    listenerPassedToOn(fakeEvent, otherId, differentIdBuffer);
    expect(cb).not.toHaveBeenCalled();

    // Simulate an event with the CORRECT id — callback MUST fire
    const correctIdBuffer = new ArrayBuffer(8);
    listenerPassedToOn(fakeEvent, myId, correctIdBuffer);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0]).toBe(correctIdBuffer);

    // Unsubscribe — same reference
    unsubscribe();
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    const offCalls = mockRemoveListener.mock.calls as [string, unknown][];
    const firstOffCall = offCalls[0]!;
    const listenerPassedToOff = firstOffCall[1];
    expect(listenerPassedToOff).toBe(listenerPassedToOn);
  });
});

describe('Preload listener identity — terminal.onExit (with id filter)', () => {
  it('removeListener uses the same function reference; mismatched id does not fire callback', async () => {
    await ensurePreloadImported();

    const myId = 'term-exit-abc' as TerminalId;
    const otherId = 'term-exit-xyz' as TerminalId;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cb = vi.fn((_code: number | null) => {});

    mockOn.mockClear();
    mockRemoveListener.mockClear();

    const terminalApi = capturedApi!['terminal'] as {
      onExit: (id: TerminalId, cb: (code: number | null) => void) => () => void;
    };
    const unsubscribe = terminalApi.onExit(myId, cb);

    expect(mockOn).toHaveBeenCalledTimes(1);
    const onCalls = mockOn.mock.calls as [string, (event: unknown, ...args: unknown[]) => void][];
    const firstOnCall = onCalls[0]!;
    const listenerPassedToOn = firstOnCall[1];

    const fakeEvent = {};

    // Wrong id — no callback fire
    listenerPassedToOn(fakeEvent, otherId, 0);
    expect(cb).not.toHaveBeenCalled();

    // Correct id — callback fires
    listenerPassedToOn(fakeEvent, myId, 1);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0]).toBe(1);

    unsubscribe();
    const offCalls = mockRemoveListener.mock.calls as [string, unknown][];
    const firstOffCall = offCalls[0]!;
    const listenerPassedToOff = firstOffCall[1];
    expect(listenerPassedToOff).toBe(listenerPassedToOn);
  });
});

describe('Preload listener identity — terminal.onError (with id filter)', () => {
  it('removeListener uses the same function reference; mismatched id does not fire callback', async () => {
    await ensurePreloadImported();

    const myId = 'term-err-abc' as TerminalId;
    const otherId = 'term-err-xyz' as TerminalId;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cb = vi.fn((_err: { code: string; message: string }): void => {});

    mockOn.mockClear();
    mockRemoveListener.mockClear();

    const terminalApi = capturedApi!['terminal'] as {
      onError: (id: TerminalId, cb: (err: { code: string; message: string }) => void) => () => void;
    };
    const unsubscribe = terminalApi.onError(myId, cb);

    expect(mockOn).toHaveBeenCalledTimes(1);
    const onCalls = mockOn.mock.calls as [string, (event: unknown, ...args: unknown[]) => void][];
    const firstOnCall = onCalls[0]!;
    const onChannel = firstOnCall[0];
    const listenerPassedToOn = firstOnCall[1];
    expect(onChannel).toBe(IPC.terminal.onError);

    const fakeEvent = {};

    // Wrong id — callback must NOT fire
    listenerPassedToOn(fakeEvent, otherId, { code: 'WRITE_TOO_LARGE', message: 'too large' });
    expect(cb).not.toHaveBeenCalled();

    // Correct id — callback must fire
    const errPayload = { code: 'WRITE_TOO_LARGE', message: 'write rejected: 999 bytes' };
    listenerPassedToOn(fakeEvent, myId, errPayload);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]?.[0]).toBe(errPayload);

    // Unsubscribe — same reference
    unsubscribe();
    expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    const offCalls = mockRemoveListener.mock.calls as [string, unknown][];
    const firstOffCall = offCalls[0]!;
    expect(firstOffCall[0]).toBe(IPC.terminal.onError);
    expect(firstOffCall[1]).toBe(listenerPassedToOn);
  });
});

// ---------------------------------------------------------------------------
// ArrayBuffer fidelity — invoke return value is not coerced
// ---------------------------------------------------------------------------

describe('ArrayBuffer round-trip fidelity', () => {
  it('terminal.spawn returns whatever ipcRenderer.invoke resolves with (byteLength preserved)', async () => {
    await ensurePreloadImported();

    // We verify the preload does NOT coerce the response — it just returns
    // the promise that ipcRenderer.invoke returns.
    const buf = new ArrayBuffer(16);
    mockInvoke.mockResolvedValueOnce(buf);

    const terminalApi = capturedApi!['terminal'] as {
      spawn: (args: string[], cwd: string) => Promise<unknown>;
    };
    const result = await terminalApi.spawn(['claude'], '/tmp');

    // The resolved value should be the EXACT same reference (not a copy)
    expect(result).toBe(buf);
    expect((result as ArrayBuffer).byteLength).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// send vs invoke dispatch
// ---------------------------------------------------------------------------

describe('terminal.write and terminal.resize use ipcRenderer.send (not invoke)', () => {
  it('terminal.write calls ipcRenderer.send with correct channel', async () => {
    await ensurePreloadImported();

    const terminalApi = capturedApi!['terminal'] as {
      write: (id: TerminalId, data: ArrayBuffer) => void;
    };

    const id = 'term-1' as TerminalId;
    const buf = new ArrayBuffer(4);
    terminalApi.write(id, buf);

    expect(mockSend).toHaveBeenCalledOnce();
    const sendCalls = mockSend.mock.calls as unknown[][];
    const sendCall = sendCalls[0]!;
    expect(sendCall[0]).toBe(IPC.terminal.write);
    expect(sendCall[1]).toBe(id);
    expect(sendCall[2]).toBe(buf);
    // invoke must NOT have been called
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('terminal.resize calls ipcRenderer.send with correct channel and dimensions', async () => {
    await ensurePreloadImported();

    const terminalApi = capturedApi!['terminal'] as {
      resize: (id: TerminalId, cols: number, rows: number) => void;
    };

    mockSend.mockClear();
    mockInvoke.mockClear();

    const id = 'term-2' as TerminalId;
    terminalApi.resize(id, 80, 24);

    expect(mockSend).toHaveBeenCalledOnce();
    const sendCalls = mockSend.mock.calls as unknown[][];
    const sendCall = sendCalls[0]!;
    expect(sendCall[0]).toBe(IPC.terminal.resize);
    expect(sendCall[1]).toBe(id);
    expect(sendCall[2]).toBe(80);
    expect(sendCall[3]).toBe(24);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
