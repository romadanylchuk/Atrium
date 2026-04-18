/**
 * Tests for src/main/ipc/safeHandle.ts
 *
 * Verifies that safeHandle wraps ipcMain.handle with a try/catch that
 * converts thrown errors into Result.err(INTERNAL, message).
 *
 * Uses a fake IpcMainLike injected via the optional parameter so no
 * real Electron runtime is needed.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { safeHandle } from '../safeHandle';
import { ok, err } from '@shared/result';
import { CommonErrorCode } from '@shared/errors';
import { makeSimpleFakeIpcMain } from './helpers/makeFakeIpcMain';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('safeHandle', () => {
  it('passes through Result.ok from a successful handler', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    safeHandle('test:ok', () => Promise.resolve(ok('hello')), fake);

    const result = await invoke('test:ok');
    expect(result).toEqual({ ok: true, data: 'hello' });
  });

  it('converts a synchronously thrown error into Result.err(INTERNAL)', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    safeHandle(
      'test:sync-throw',
      () => {
        throw new Error('boom sync');
      },
      fake,
    );

    const result = await invoke('test:sync-throw');
    expect(result).toEqual({
      ok: false,
      error: { code: CommonErrorCode.INTERNAL, message: 'boom sync' },
    });
  });

  it('converts a Promise rejection into Result.err(INTERNAL)', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    safeHandle(
      'test:reject',
      () => Promise.reject(new Error('async boom')),
      fake,
    );

    const result = await invoke('test:reject');
    expect(result).toEqual({
      ok: false,
      error: { code: CommonErrorCode.INTERNAL, message: 'async boom' },
    });
  });

  it('uses String() coercion when a string literal is thrown', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    safeHandle('test:throw-string', () => { throw 'plain string error'; }, fake);

    const result = await invoke('test:throw-string');
    expect(result).toEqual({
      ok: false,
      error: { code: CommonErrorCode.INTERNAL, message: 'plain string error' },
    });
  });

  it('uses String() coercion when null is thrown — message equals "null"', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    safeHandle('test:throw-null', () => { throw null; }, fake);

    const result = await invoke('test:throw-null');
    expect(result).toEqual({
      ok: false,
      error: { code: CommonErrorCode.INTERNAL, message: 'null' },
    });
  });

  it('passes through Result.err from a handler without modification', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    safeHandle(
      'test:err-passthrough',
      () => Promise.resolve(err(CommonErrorCode.NOT_IMPLEMENTED, 'stage 03')),
      fake,
    );

    const result = await invoke('test:err-passthrough');
    expect(result).toEqual({
      ok: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'stage 03' },
    });
  });

  it('forwards arguments from the invoke call to the handler', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    const spy = vi.fn((_event: IpcMainInvokeEvent, a: unknown, b: unknown) =>
      Promise.resolve(ok({ a, b })),
    );
    safeHandle('test:args', spy, fake);

    await invoke('test:args', 'foo', 42);
    expect(spy).toHaveBeenCalledTimes(1);
    const callArgs = spy.mock.calls[0];
    // args[1] and args[2] are the forwarded arguments
    expect(callArgs?.[1]).toBe('foo');
    expect(callArgs?.[2]).toBe(42);
  });

  it('coerces a non-Error rejected number via String()', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    safeHandle(
      'test:number-rejection',
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      () => Promise.reject(42),
      fake,
    );

    const result = await invoke('test:number-rejection');
    expect(result).toMatchObject({
      ok: false,
      error: { code: CommonErrorCode.INTERNAL, message: '42' },
    });
  });
});
