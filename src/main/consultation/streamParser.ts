import type { StreamResultEvent, StreamAssistantEvent } from './errorMapper.js';
import { STREAM_EVENT_RESULT, STREAM_EVENT_ASSISTANT } from './constants.js';

export interface StreamEventHandlers {
  onAssistant(ev: StreamAssistantEvent): void;
  onResult(ev: StreamResultEvent): void;
}

/** Buffers UTF-8 stdout bytes, emits parsed events on newline boundaries.
 *  Returns a writer object with .push(bytes) and .flush() for end-of-stream. */
export function createStreamParser(handlers: StreamEventHandlers): {
  push(bytes: Buffer): void;
  flush(): void;
} {
  let buf = Buffer.alloc(0);

  function processLine(line: string): void {
    if (!line.trim()) return;
    try {
      const ev = JSON.parse(line) as Record<string, unknown>;
      if (ev['type'] === STREAM_EVENT_ASSISTANT) {
        handlers.onAssistant(ev as unknown as StreamAssistantEvent);
      } else if (ev['type'] === STREAM_EVENT_RESULT) {
        handlers.onResult(ev as unknown as StreamResultEvent);
      }
    } catch {
      // non-JSON line — ignore
    }
  }

  return {
    push(bytes: Buffer): void {
      buf = Buffer.concat([buf, bytes]);
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.subarray(0, idx).toString('utf-8');
        buf = buf.subarray(idx + 1);
        processLine(line);
      }
    },
    flush(): void {
      if (buf.length > 0) {
        processLine(buf.toString('utf-8'));
        buf = Buffer.alloc(0);
      }
    },
  };
}
