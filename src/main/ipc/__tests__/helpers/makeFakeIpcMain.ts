/**
 * makeFakeIpcMain — shared test helper.
 *
 * Provides two factory functions used across safeHandle.test.ts,
 * stubHandlers.test.ts, and projectHandlers.test.ts.
 *
 * - `makeSimpleFakeIpcMain()` — handle-only fake; returns `{ fake, invoke }`.
 *   Used by safeHandle.test.ts and projectHandlers.test.ts.
 *
 * - `makeFullFakeIpcMain()` — handle + on fake; returns a `FakeIpcMain` object
 *   with both invokeHandlers and onHandlers maps.
 *   Used by stubHandlers.test.ts (which registers both invoke and on handlers).
 *
 * Both factories preserve the EXACT same semantics as the original inline
 * implementations.
 *
 * Note: `invoke` / `invokeChannel` use arrow-function properties (not methods)
 * so they are safe to destructure without `this`-rebinding issues.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { IpcMainLike } from '@main/ipc/safeHandle';
import type { IpcMainOnLike } from '@main/ipc/terminal';

// ---------------------------------------------------------------------------
// Simple (handle-only) fake — safeHandle.test.ts + projectHandlers.test.ts
// ---------------------------------------------------------------------------

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

export interface SimpleFakeIpcMain {
  fake: IpcMainLike;
  /** Arrow-function property — safe to destructure. */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

/**
 * Creates a fake IpcMainLike that captures `handle` registrations.
 * Returns { fake, invoke } where `invoke(channel, ...args)` dispatches
 * to the registered handler with a synthetic event.
 */
export function makeSimpleFakeIpcMain(): SimpleFakeIpcMain {
  const handlers = new Map<string, InvokeHandler>();
  const fakeEvent = {} as IpcMainInvokeEvent;

  const fake: IpcMainLike = {
    handle(channel: string, listener: InvokeHandler): void {
      handlers.set(channel, listener);
    },
    on(): void {
      // no-op — simple fake only needs handle
    },
  };

  const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for channel: ${channel}`);
    return handler(fakeEvent, ...args);
  };

  return { fake, invoke };
}

// ---------------------------------------------------------------------------
// Full (handle + on) fake — stubHandlers.test.ts
// ---------------------------------------------------------------------------

export interface FullFakeIpcMain extends IpcMainLike, IpcMainOnLike {
  invokeHandlers: Map<string, InvokeHandler>;
  onHandlers: Map<string, (...args: unknown[]) => void>;
  /** Arrow-function property — safe to call without binding. */
  invokeChannel: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

/**
 * Creates a fake IpcMainLike that captures both `handle` (invoke) and
 * `on` (fire-and-forget) registrations.
 *
 * Use `.invokeChannel(channel, ...args)` to dispatch to a handle handler.
 * Use `.onHandlers.get(channel)` to directly access on-subscribers.
 */
export function makeFullFakeIpcMain(): FullFakeIpcMain {
  const invokeHandlers = new Map<string, InvokeHandler>();
  const onHandlers = new Map<string, (...args: unknown[]) => void>();
  const fakeEvent = {} as IpcMainInvokeEvent;

  const invokeChannel = async (channel: string, ...args: unknown[]): Promise<unknown> => {
    const handler = invokeHandlers.get(channel);
    if (!handler) throw new Error(`No invoke handler for: ${channel}`);
    return handler(fakeEvent, ...args);
  };

  return {
    invokeHandlers,
    onHandlers,
    handle(channel: string, listener: InvokeHandler) {
      invokeHandlers.set(channel, listener);
    },
    on(channel: string, listener: (...args: unknown[]) => void) {
      onHandlers.set(channel, listener);
    },
    invokeChannel,
  };
}
