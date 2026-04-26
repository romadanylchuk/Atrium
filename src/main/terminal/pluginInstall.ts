/**
 * Hidden-pty install runner for the architector@getleverage Claude Code plugin.
 *
 * INVARIANT: this module must NEVER import TerminalManager or touch any TerminalId /
 * TerminalState.  Install ptys are fully independent and are killed before each
 * step returns.  See "singleton-slot invariant" in the feature plan Phase 3.
 */
import { spawn as ptySpawn } from 'node-pty';
import { HealthErrorCode } from '@shared/errors.js';
import type { InstallOutcome } from '@shared/domain.js';
import { checkArchitectorPlugin } from './pluginCheck.js';

export const INSTALL_STEP_TIMEOUT_MS = 60_000;

// Module-level singleton so the cancelInstall IPC channel can reach the live install.
let activeHandle: { cancel: () => void } | null = null;

export function getActiveInstallHandle(): { cancel: () => void } | null {
  return activeHandle;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

interface SpawnStepResult {
  exitCode: number;
  timedOut: boolean;
  stdout: string;
}

function spawnStep(
  claudePath: string,
  args: string[],
  cwd: string,
  onPty: (pty: ReturnType<typeof ptySpawn>) => void,
  onData: (chunk: string) => void,
): Promise<SpawnStepResult> {
  return new Promise((resolve) => {
    let buffer = '';
    let stepSettled = false;

    const pty = ptySpawn(claudePath, args, {
      cwd,
      env: process.env as Record<string, string>,
      cols: 120,
      rows: 30,
      name: 'xterm-256color',
    });

    onPty(pty);

    const timer = setTimeout(() => {
      if (stepSettled) return;
      stepSettled = true;
      try { pty.kill(); } catch { /* ignore */ }
      resolve({ exitCode: 1, timedOut: true, stdout: buffer });
    }, INSTALL_STEP_TIMEOUT_MS);

    pty.onData((data: string) => {
      buffer += data;
      onData(data);
    });

    pty.onExit(({ exitCode }: { exitCode: number | undefined }) => {
      if (stepSettled) return;
      stepSettled = true;
      clearTimeout(timer);
      resolve({ exitCode: exitCode ?? 1, timedOut: false, stdout: buffer });
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs `claude plugin marketplace add` → `claude plugin install` → re-probe
 * sequentially in hidden ptys.  The returned promise never rejects — every
 * failure mode resolves as `{ kind: 'failed', ... }`.  The returned `cancel()`
 * SIGTERMs the active pty and resolves the promise immediately.
 */
export function installArchitectorPlugin(
  claudePath: string,
  cwd: string,
): {
  promise: Promise<InstallOutcome>;
  cancel: () => void;
} {
  // Concurrent install guard: the IPC layer checks this too, but defensive here.
  if (activeHandle !== null) {
    return {
      promise: Promise.resolve({
        kind: 'failed' as const,
        step: 'marketplace-add' as const,
        code: HealthErrorCode.INSTALL_FAILED,
        message: 'another install is in flight',
        stdout: '',
        stderr: '',
      }),
      cancel: () => { /* no-op */ },
    };
  }

  let outerResolve!: (outcome: InstallOutcome) => void;
  const outerPromise = new Promise<InstallOutcome>((resolve) => {
    outerResolve = resolve;
  });

  let currentPty: { kill(): void } | null = null;
  let settled = false;
  let currentStep: 'marketplace-add' | 'install' | 'post-probe' = 'marketplace-add';
  let accumulatedStdout = '';

  const cancelFn = (): void => {
    if (settled) return;
    settled = true;
    const stepSnapshot = currentStep;
    try { currentPty?.kill(); } catch { /* ignore */ }
    activeHandle = null;
    outerResolve({
      kind: 'failed',
      step: stepSnapshot,
      code: HealthErrorCode.INSTALL_CANCELLED,
      message: 'install cancelled',
      stdout: accumulatedStdout,
      stderr: '',
    });
  };

  activeHandle = { cancel: cancelFn };

  const run = async (): Promise<void> => {
    // Step A: add marketplace source.
    currentStep = 'marketplace-add';
    const stepA = await spawnStep(
      claudePath,
      ['plugin', 'marketplace', 'add', 'romadanylchuk/getleverage'],
      cwd,
      (pty) => { currentPty = pty; },
      (chunk) => { accumulatedStdout += chunk; },
    );
    if (settled) return;

    if (stepA.exitCode !== 0) {
      settled = true;
      activeHandle = null;
      outerResolve({
        kind: 'failed',
        step: 'marketplace-add',
        code: stepA.timedOut ? HealthErrorCode.INSTALL_TIMEOUT : HealthErrorCode.INSTALL_FAILED,
        message: stepA.timedOut ? 'marketplace add timed out' : 'marketplace add failed',
        stdout: stepA.stdout,
        stderr: '',
      });
      return;
    }

    // Step B: install the plugin.
    currentStep = 'install';
    const stepB = await spawnStep(
      claudePath,
      ['plugin', 'install', 'architector@getleverage'],
      cwd,
      (pty) => { currentPty = pty; },
      (chunk) => { accumulatedStdout += chunk; },
    );
    if (settled) return;

    if (stepB.exitCode !== 0) {
      settled = true;
      activeHandle = null;
      outerResolve({
        kind: 'failed',
        step: 'install',
        code: stepB.timedOut ? HealthErrorCode.INSTALL_TIMEOUT : HealthErrorCode.INSTALL_FAILED,
        message: stepB.timedOut ? 'plugin install timed out' : 'plugin install failed',
        stdout: accumulatedStdout,
        stderr: '',
      });
      return;
    }

    // Step C: post-install probe to confirm success.
    currentStep = 'post-probe';
    currentPty = null; // no pty during probe; cancel becomes a no-op kill
    const probeResult = await checkArchitectorPlugin(claudePath);
    if (settled) return;

    settled = true;
    activeHandle = null;

    if (probeResult.ok) {
      outerResolve({ kind: 'success', pluginInfo: probeResult.data });
    } else {
      outerResolve({
        kind: 'failed',
        step: 'post-probe',
        code: HealthErrorCode.PLUGIN_NOT_FOUND,
        message: probeResult.error.message,
        stdout: accumulatedStdout,
        stderr: '',
      });
    }
  };

  run().catch((error) => {
    if (!settled) {
      settled = true;
      activeHandle = null;
      outerResolve({
        kind: 'failed',
        step: currentStep,
        code: HealthErrorCode.INSTALL_FAILED,
        message: `unexpected internal error: ${error instanceof Error ? error.message : String(error)}`,
        stdout: accumulatedStdout,
        stderr: '',
      });
    }
  });

  return { promise: outerPromise, cancel: cancelFn };
}
