import { IPC } from '@shared/ipc';
import { composeConsultationCommand } from '@shared/skill/composeCommand';
import { TerminalManager } from '@main/terminal';
import { safeHandle, type IpcMainLike } from './safeHandle';
import { ipcMain as defaultIpcMain } from './ipcModule';

export function registerConsultationSpawnHandler(
  terminalManager: TerminalManager,
  ipcMainLike: IpcMainLike = defaultIpcMain,
): void {
  safeHandle(
    IPC.consultation.spawnTerminal,
    // eslint-disable-next-line @typescript-eslint/require-await
    async (_event, rawArgs) => {
      const { cwd } = rawArgs as { cwd: string };
      if (terminalManager.getState() !== 'idle') {
        terminalManager.shutdownForReuse();
      }
      const args = composeConsultationCommand(cwd);
      return terminalManager.spawn(args, cwd);
    },
    ipcMainLike,
  );
}
