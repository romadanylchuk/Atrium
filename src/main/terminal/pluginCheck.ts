/**
 * Standalone plugin-probe for the architector@getleverage Claude Code plugin.
 *
 * INVARIANT: this module must NEVER import TerminalManager or touch any TerminalId /
 * TerminalState.  The probe pty is fully independent and is killed before the
 * function returns.  See "singleton-slot invariant" in the feature plan Phase 2.
 */
import { spawn as ptySpawn } from 'node-pty';
import { ok, err } from '@shared/result.js';
import { HealthErrorCode } from '@shared/errors.js';
import type { Result } from '@shared/result.js';
import type { PluginInfo } from '@shared/domain.js';

export const PLUGIN_PROBE_TIMEOUT_MS = 5_000;

const TARGET_PLUGIN_ID = 'architector@getleverage' as const;

export function checkArchitectorPlugin(
  claudePath: string,
): Promise<Result<PluginInfo, HealthErrorCode>> {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;

    const pty = ptySpawn(claudePath, ['plugin', 'list', '--json'], {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      cols: 120,
      rows: 30,
      name: 'xterm-256color',
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { pty.kill(); } catch { /* ignore */ }
      resolve(err(
        HealthErrorCode.PLUGIN_PROBE_TIMEOUT,
        `claude plugin list --json did not respond within ${PLUGIN_PROBE_TIMEOUT_MS}ms`,
      ));
    }, PLUGIN_PROBE_TIMEOUT_MS);

    pty.onData((data: string) => {
      buffer += data;
    });

    pty.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if ((exitCode ?? 1) !== 0) {
        resolve(err(
          HealthErrorCode.PLUGIN_LIST_UNAVAILABLE,
          `claude plugin list --json exited with code ${exitCode}`,
        ));
        return;
      }

      const clean = buffer
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .trim();

      let entries: unknown[];
      try {
        const parsed: unknown = JSON.parse(clean);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        entries = parsed;
      } catch {
        resolve(err(
          HealthErrorCode.PLUGIN_LIST_UNAVAILABLE,
          'claude plugin list --json output could not be parsed as a JSON array',
        ));
        return;
      }

      type RawEntry = { id?: unknown; version?: unknown; enabled?: unknown };
      const entry = (entries as RawEntry[]).find((e) => e.id === TARGET_PLUGIN_ID);

      if (!entry) {
        resolve(err(
          HealthErrorCode.PLUGIN_NOT_FOUND,
          `plugin '${TARGET_PLUGIN_ID}' is not installed`,
        ));
        return;
      }

      if (entry.enabled === false) {
        resolve(err(
          HealthErrorCode.PLUGIN_NOT_FOUND,
          `plugin '${TARGET_PLUGIN_ID}' is installed but not enabled`,
        ));
        return;
      }

      resolve(ok({
        pluginId: TARGET_PLUGIN_ID,
        version: typeof entry.version === 'string' ? entry.version : 'unknown',
        enabled: true,
      }));
    });
  });
}
