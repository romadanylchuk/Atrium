import { describe, it, expect, vi } from 'vitest';
import { IPC } from '@shared/ipc';
import { registerUpdateHandlers } from '../update';
import { makeSimpleFakeIpcMain } from './helpers/makeFakeIpcMain';

describe('registerUpdateHandlers', () => {
  it('without a service (dev build) reports idle and no-ops', async () => {
    const { fake, invoke } = makeSimpleFakeIpcMain();
    registerUpdateHandlers(undefined, fake);
    expect(await invoke(IPC.update.getStatus)).toEqual({ ok: true, data: { kind: 'idle' } });
    expect(await invoke(IPC.update.download)).toEqual({ ok: true, data: undefined });
    expect(await invoke(IPC.update.openReleasePage)).toEqual({ ok: true, data: undefined });
  });

  it('delegates to the update service', async () => {
    const service = {
      getStatus: vi.fn(() => ({ kind: 'downloaded', version: '0.1.4' })),
      download: vi.fn().mockResolvedValue(undefined),
      openReleasePage: vi.fn().mockResolvedValue(undefined),
    };
    const { fake, invoke } = makeSimpleFakeIpcMain();
    registerUpdateHandlers(service as never, fake);
    expect(await invoke(IPC.update.getStatus)).toEqual({ ok: true, data: { kind: 'downloaded', version: '0.1.4' } });
    await invoke(IPC.update.download);
    await invoke(IPC.update.openReleasePage);
    expect(service.download).toHaveBeenCalledOnce();
    expect(service.openReleasePage).toHaveBeenCalledOnce();
  });
});
