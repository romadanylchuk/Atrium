import { describe, it, expect } from 'vitest';
import { createStreamParser, type StreamEventHandlers } from '../streamParser.js';
import type { StreamResultEvent, StreamAssistantEvent } from '../errorMapper.js';

function makeHandlers() {
  const assistantEvents: StreamAssistantEvent[] = [];
  const resultEvents: StreamResultEvent[] = [];
  const handlers: StreamEventHandlers = {
    onAssistant(ev) { assistantEvents.push(ev); },
    onResult(ev) { resultEvents.push(ev); },
  };
  return { handlers, assistantEvents, resultEvents };
}

// ---------------------------------------------------------------------------
// Partial-line buffering
// ---------------------------------------------------------------------------

describe('createStreamParser — partial-line buffering', () => {
  it('buffers partial lines and dispatches when newline arrives', () => {
    const { handlers, assistantEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hello' }] },
    });
    const mid = Math.floor(line.length / 2);

    parser.push(Buffer.from(line.slice(0, mid)));
    expect(assistantEvents).toHaveLength(0);

    parser.push(Buffer.from(line.slice(mid) + '\n'));
    expect(assistantEvents).toHaveLength(1);
    expect(assistantEvents[0]!.message?.content?.[0]?.text).toBe('hello');
  });

  it('handles multiple complete lines in a single push', () => {
    const { handlers, resultEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    const line1 = JSON.stringify({ type: 'result', is_error: false, result: 'first' });
    const line2 = JSON.stringify({ type: 'result', is_error: false, result: 'second' });
    parser.push(Buffer.from(`${line1}\n${line2}\n`));

    expect(resultEvents).toHaveLength(2);
    expect(resultEvents[0]!.result).toBe('first');
    expect(resultEvents[1]!.result).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// Non-JSON tolerance
// ---------------------------------------------------------------------------

describe('createStreamParser — non-JSON tolerance', () => {
  it('ignores lines that are not valid JSON', () => {
    const { handlers, resultEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    parser.push(Buffer.from('not valid json\n'));
    parser.push(Buffer.from('{ broken\n'));
    parser.push(Buffer.from(JSON.stringify({ type: 'result', is_error: false, result: 'ok' }) + '\n'));

    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0]!.result).toBe('ok');
  });

  it('ignores blank lines', () => {
    const { handlers, resultEvents, assistantEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    parser.push(Buffer.from('\n\n\n'));
    parser.push(Buffer.from(JSON.stringify({ type: 'result', is_error: false }) + '\n'));

    expect(resultEvents).toHaveLength(1);
    expect(assistantEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Event type filtering
// ---------------------------------------------------------------------------

describe('createStreamParser — event type filtering', () => {
  it('dispatches only assistant and result types, ignores others', () => {
    const { handlers, assistantEvents, resultEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    parser.push(Buffer.from(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n'));
    parser.push(Buffer.from(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: {} }) + '\n'));
    parser.push(Buffer.from(JSON.stringify({ type: 'user', message: {} }) + '\n'));
    parser.push(Buffer.from(JSON.stringify({ type: 'assistant', message: null }) + '\n'));
    parser.push(Buffer.from(JSON.stringify({ type: 'result', is_error: false }) + '\n'));

    expect(assistantEvents).toHaveLength(1);
    expect(resultEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// flush() — trailing bytes without newline
// ---------------------------------------------------------------------------

describe('createStreamParser — flush', () => {
  it('processes a trailing line that has no trailing newline', () => {
    const { handlers, resultEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    const line = JSON.stringify({ type: 'result', is_error: false, result: 'final' });
    parser.push(Buffer.from(line)); // no newline
    expect(resultEvents).toHaveLength(0);

    parser.flush();
    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0]!.result).toBe('final');
  });

  it('flush is idempotent when buffer is empty', () => {
    const { handlers, resultEvents } = makeHandlers();
    const parser = createStreamParser(handlers);

    parser.push(Buffer.from(JSON.stringify({ type: 'result', is_error: false, result: 'done' }) + '\n'));
    parser.flush();
    parser.flush(); // second flush should be safe

    expect(resultEvents).toHaveLength(1);
  });
});
