import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  mapResultEvent,
  mapAssistantError,
  mapSpawnFailure,
  type StreamResultEvent,
  type StreamAssistantEvent,
} from '../errorMapper.js';
import { ConsultationErrorCode } from '@shared/errors.js';

const C = ConsultationErrorCode;

// ---------------------------------------------------------------------------
// mapResultEvent — table-driven
// ---------------------------------------------------------------------------

describe('mapResultEvent', () => {
  it('returns undefined when is_error is false', () => {
    const ev: StreamResultEvent = { type: 'result', is_error: false, result: 'ok' };
    expect(mapResultEvent(ev)).toBeUndefined();
  });

  it.each([
    ['Not logged in · Please run /login', undefined, C.NOT_AUTHENTICATED],
    ['not logged in', undefined, C.NOT_AUTHENTICATED],
    ['session not found', undefined, C.SESSION_LOST],
    ['invalid session id', undefined, C.SESSION_LOST],
    ['unknown session abc', undefined, C.SESSION_LOST],
    ['budget exceeded', undefined, C.BUDGET_EXCEEDED],
    ['max-budget reached', undefined, C.BUDGET_EXCEEDED],
    ['generic server error', undefined, C.INTERNAL],
    ['', 'rate_limit_exceeded', C.QUOTA_EXCEEDED],
    ['', 'quota_exceeded', C.QUOTA_EXCEEDED],
    ['', 'network_error', C.NETWORK_ERROR],
    ['', 'connect_refused', C.NETWORK_ERROR],
    ['', 'timeout_error', C.NETWORK_ERROR],
    ['', 'unknown_status', C.INTERNAL],
  ] as const)(
    'result=%j apiStatus=%j → %s',
    (result, apiStatus, expected) => {
      const ev: StreamResultEvent = {
        type: 'result',
        is_error: true,
        result,
        api_error_status: apiStatus ?? undefined,
      };
      expect(mapResultEvent(ev)).toBe(expected);
    },
  );

  it('handles missing result and api_error_status gracefully → INTERNAL', () => {
    const ev: StreamResultEvent = { type: 'result', is_error: true };
    expect(mapResultEvent(ev)).toBe(C.INTERNAL);
  });
});

// ---------------------------------------------------------------------------
// mapAssistantError — table-driven
// ---------------------------------------------------------------------------

describe('mapAssistantError', () => {
  it('returns undefined when no error field', () => {
    const ev: StreamAssistantEvent = { type: 'assistant' };
    expect(mapAssistantError(ev)).toBeUndefined();
  });

  it.each([
    ['authentication_failed', C.NOT_AUTHENTICATED],
    ['some_other_error', C.INTERNAL],
    ['rate_limit', C.INTERNAL],
  ] as const)('error=%j → %s', (error, expected) => {
    const ev: StreamAssistantEvent = { type: 'assistant', error };
    expect(mapAssistantError(ev)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// mapSpawnFailure — table-driven
// ---------------------------------------------------------------------------

describe('mapSpawnFailure', () => {
  it.each([
    [{ exitCode: null, stderr: '', signal: null, spawnErrorCode: 'ENOENT' }, C.CLAUDE_NOT_FOUND],
    [{ exitCode: 1, stderr: 'error', signal: null, spawnErrorCode: 'ENOENT' }, C.CLAUDE_NOT_FOUND],
    [{ exitCode: null, stderr: '', signal: 'SIGTERM' as NodeJS.Signals, spawnErrorCode: undefined }, C.CANCELLED],
    [{ exitCode: null, stderr: '', signal: 'SIGKILL' as NodeJS.Signals, spawnErrorCode: undefined }, C.CANCELLED],
    [{ exitCode: 1, stderr: 'stderr output', signal: null, spawnErrorCode: undefined }, C.INVALID_OUTPUT],
    [{ exitCode: 1, stderr: '', signal: null, spawnErrorCode: undefined }, C.INTERNAL],
    [{ exitCode: 0, stderr: '', signal: null, spawnErrorCode: undefined }, C.INTERNAL],
    [{ exitCode: null, stderr: '', signal: null, spawnErrorCode: undefined }, C.INTERNAL],
  ] as const)('args=%j → %s', (args, expected) => {
    expect(mapSpawnFailure(args)).toBe(expected);
  });

  it('ENOENT takes precedence over non-zero exit + stderr', () => {
    expect(
      mapSpawnFailure({ exitCode: 127, stderr: 'command not found', signal: null, spawnErrorCode: 'ENOENT' }),
    ).toBe(C.CLAUDE_NOT_FOUND);
  });

  it('signal takes precedence over non-zero exit + stderr', () => {
    expect(
      mapSpawnFailure({ exitCode: null, stderr: 'killed', signal: 'SIGTERM', spawnErrorCode: undefined }),
    ).toBe(C.CANCELLED);
  });
});

// ---------------------------------------------------------------------------
// Fixture-driven: r1-happy.jsonl — auth failure → NOT_AUTHENTICATED
// ---------------------------------------------------------------------------

describe('fixture: r1-happy.jsonl', () => {
  it('mapper chain yields NOT_AUTHENTICATED for the auth-failure stream', () => {
    const fixturePath = path.resolve(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../../../.ai-work/phase0/r1-happy.jsonl',
    );

    const lines = fs.readFileSync(fixturePath, 'utf-8').split('\n').filter(l => l.trim());
    const mappedCodes: (ConsultationErrorCode | undefined)[] = [];

    for (const line of lines) {
      const ev = JSON.parse(line) as { type: string; [k: string]: unknown };
      if (ev.type === 'assistant') {
        mappedCodes.push(mapAssistantError(ev as unknown as StreamAssistantEvent));
      } else if (ev.type === 'result') {
        mappedCodes.push(mapResultEvent(ev as unknown as StreamResultEvent));
      }
    }

    const errorCodes = mappedCodes.filter((c): c is ConsultationErrorCode => c !== undefined);
    expect(errorCodes.length).toBeGreaterThan(0);
    expect(errorCodes.every(c => c === C.NOT_AUTHENTICATED)).toBe(true);
  });
});
