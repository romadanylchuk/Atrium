import { ConsultationErrorCode } from '@shared/errors.js';

/** Minimal shape of a parsed stream-json event — only the fields the mapper reads. */
export interface StreamResultEvent {
  type: 'result';
  is_error: boolean;
  subtype?: string;
  api_error_status?: string;
  result?: string;
  terminal_reason?: string;
}

export interface StreamAssistantEvent {
  type: 'assistant';
  error?: string;
  message?: { content?: Array<{ type: string; text?: string }> };
}

/** Called when a `result` event is received. Returns undefined if is_error=false. */
export function mapResultEvent(ev: StreamResultEvent): ConsultationErrorCode | undefined {
  if (!ev.is_error) return undefined;

  const result = ev.result ?? '';
  const apiStatus = ev.api_error_status ?? '';

  if (/not logged in/i.test(result)) return ConsultationErrorCode.NOT_AUTHENTICATED;
  if (/rate_limit|quota/i.test(apiStatus)) return ConsultationErrorCode.QUOTA_EXCEEDED;
  if (/session.*not found|invalid session|unknown session/i.test(result)) return ConsultationErrorCode.SESSION_LOST;
  if (/budget|max-budget/i.test(result)) return ConsultationErrorCode.BUDGET_EXCEEDED;
  if (/network|connect|timeout/i.test(apiStatus)) return ConsultationErrorCode.NETWORK_ERROR;

  return ConsultationErrorCode.INTERNAL;
}

/** Called eagerly on `assistant` events that carry error: "..." so the UI can react
 *  before the terminal `result` arrives. Returns undefined on non-error assistant events. */
export function mapAssistantError(ev: StreamAssistantEvent): ConsultationErrorCode | undefined {
  if (!ev.error) return undefined;
  if (ev.error === 'authentication_failed') return ConsultationErrorCode.NOT_AUTHENTICATED;
  return ConsultationErrorCode.INTERNAL;
}

/** Called when the process exits with no parsed stream events (or with stderr only). */
export function mapSpawnFailure(args: {
  exitCode: number | null;
  stderr: string;
  signal: NodeJS.Signals | null;
  spawnErrorCode?: string;
}): ConsultationErrorCode {
  if (args.spawnErrorCode === 'ENOENT') return ConsultationErrorCode.CLAUDE_NOT_FOUND;
  if (args.signal === 'SIGTERM' || args.signal === 'SIGKILL') return ConsultationErrorCode.CANCELLED;
  if (args.exitCode !== null && args.exitCode !== 0 && args.signal === null && args.stderr.length > 0) {
    return ConsultationErrorCode.INVALID_OUTPUT;
  }
  return ConsultationErrorCode.INTERNAL;
}
