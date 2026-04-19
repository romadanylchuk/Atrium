import { describe, it, expect } from 'vitest';
import { IPC } from '../ipc.js';

describe('IPC channel constants', () => {
  it('skill.spawn is correctly namespaced', () => {
    expect(IPC.skill.spawn).toBe('skill:spawn');
  });

  it('skill.spawn follows the namespace:action pattern used by other channels', () => {
    const allChannels = [
      IPC.project.open,
      IPC.project.switch,
      IPC.project.getRecents,
      IPC.dialog.openFolder,
      IPC.fileSync.startWatching,
      IPC.fileSync.stopWatching,
      IPC.fileSync.onChanged,
      IPC.terminal.spawn,
      IPC.terminal.kill,
      IPC.terminal.write,
      IPC.terminal.resize,
      IPC.terminal.onData,
      IPC.terminal.onExit,
      IPC.terminal.onError,
      IPC.health.checkClaude,
      IPC.layout.load,
      IPC.layout.save,
      IPC.layout.saveSnapshot,
      IPC.skill.spawn,
    ];

    for (const channel of allChannels) {
      expect(channel).toMatch(/^[a-zA-Z]+:[a-zA-Z]/);
    }
  });
});
