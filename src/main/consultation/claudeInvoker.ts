import { spawn as nodeSpawn } from 'node:child_process';
import type { ConsultationModel } from '@shared/consultation.js';
import type { ConsultationErrorCode } from '@shared/errors.js';
import { mapResultEvent, mapAssistantError, mapSpawnFailure } from './errorMapper.js';
import { createStreamParser } from './streamParser.js';
import { CONSULTATION_KILL_FALLBACK_MS } from './constants.js';

export interface InvokeRequest {
  claudeBin: string;
  projectRoot: string;
  sessionId: string;
  mode: 'first' | 'resume';
  model: ConsultationModel;
  userMessage: string;
  systemPrompt: string;
  budgetUsd: number;
  fallbackModel?: ConsultationModel;
}

export interface InvokeHandle {
  cancel(): void;
  done: Promise<void>;
}

export interface InvokeCallbacks {
  onChunk(fullText: string): void;
  onComplete(fullContent: string): void;
  onError(code: ConsultationErrorCode, raw?: string): void;
}

/** Exposed for tests — given an InvokeRequest, returns the argv after the binary.
 *  Deterministic ordering: non-variadic flags → variadic flags → positional prompt. */
export function buildArgv(req: InvokeRequest): string[] {
  const modeFlags =
    req.mode === 'first'
      ? ['--session-id', req.sessionId]
      : ['--resume', req.sessionId];

  const fallbackFlags = req.fallbackModel ? ['--fallback-model', req.fallbackModel] : [];

  return [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    ...modeFlags,
    '--permission-mode', 'dontAsk',
    '--system-prompt', req.systemPrompt,
    '--model', req.model,
    '--max-budget-usd', String(req.budgetUsd),
    ...fallbackFlags,
    '--add-dir', req.projectRoot,
    '--allowedTools', 'Read', 'Grep', 'Glob',
    // `--` terminates option parsing so the variadic --allowedTools (and --add-dir)
    // do not slurp the user message into their value lists. Without this, claude
    // exits 1 with "Input must be provided ... when using --print".
    '--',
    req.userMessage,
  ];
}

export function invokeClaude(req: InvokeRequest, cb: InvokeCallbacks): InvokeHandle {
  let accumulatedText = '';
  let completeCalled = false;
  let errorCalled = false;
  const stderrChunks: Buffer[] = [];

  const child = nodeSpawn(req.claudeBin, buildArgv(req), {
    cwd: req.projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const parser = createStreamParser({
    onAssistant(ev) {
      if (ev.error) {
        const code = mapAssistantError(ev);
        if (code !== undefined && !errorCalled) {
          errorCalled = true;
          cb.onError(code);
        }
        return;
      }
      const textBlocks = ev.message?.content?.filter((b) => b.type === 'text') ?? [];
      const text = textBlocks.map((b) => b.text ?? '').join('');
      if (text) {
        accumulatedText += text;
        cb.onChunk(accumulatedText);
      }
    },
    onResult(ev) {
      if (ev.is_error) {
        const code = mapResultEvent(ev);
        if (code !== undefined && !errorCalled) {
          errorCalled = true;
          cb.onError(code, ev.result);
        }
      } else if (!completeCalled && !errorCalled) {
        completeCalled = true;
        cb.onComplete(ev.result ?? accumulatedText);
      }
    },
  });

  child.stdout.on('data', (chunk: Buffer) => parser.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (!errorCalled) {
      errorCalled = true;
      const code = mapSpawnFailure({
        exitCode: null,
        stderr: '',
        signal: null,
        spawnErrorCode: err.code,
      });
      cb.onError(code);
    }
  });

  let fallbackKillTimer: ReturnType<typeof setTimeout> | null = null;
  let storedExitCode: number | null = null;
  let storedSignal: NodeJS.Signals | null = null;

  child.on('exit', (exitCode, signal) => {
    storedExitCode = exitCode;
    storedSignal = signal;
    if (fallbackKillTimer !== null) {
      clearTimeout(fallbackKillTimer);
      fallbackKillTimer = null;
    }
  });

  child.stdout.on('end', () => {
    parser.flush();
  });

  const done = new Promise<void>((resolve) => {
    child.on('close', () => {
      if (!completeCalled && !errorCalled) {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');
        const code = mapSpawnFailure({
          exitCode: storedExitCode,
          stderr,
          signal: storedSignal,
        });
        errorCalled = true;
        cb.onError(code);
      }
      resolve();
    });
  });

  return {
    cancel() {
      if (process.platform === 'win32') {
        child.kill();
      } else {
        if (fallbackKillTimer !== null) {
          clearTimeout(fallbackKillTimer);
        }
        child.kill('SIGTERM');
        fallbackKillTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, CONSULTATION_KILL_FALLBACK_MS);
      }
    },
    done,
  };
}
