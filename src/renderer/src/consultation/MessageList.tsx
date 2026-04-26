import { useEffect, useRef, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { MessageBubble } from './MessageBubble';
import type { ConsultationMessage } from '@shared/index';

export function MessageList(): JSX.Element {
  const thread = useAtriumStore((s) => s.consultation.thread);
  const pending = useAtriumStore((s) => s.consultation.pending);
  const inFlight = useAtriumStore((s) => s.consultation.inFlight);
  const lastError = useAtriumStore((s) => s.consultation.lastError);

  const messages: ConsultationMessage[] = thread?.messages ?? pending?.messages ?? [];

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [messages.length, inFlight?.assistantText, lastError?.messageId]);

  return (
    <div
      ref={scrollRef}
      data-testid="consultation-message-list"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: '#0f0f12',
      }}
    >
      {messages.length === 0 && inFlight === null && lastError === null && (
        <div
          data-testid="consultation-empty-state"
          style={{ color: '#6a6a72', fontSize: 11, alignSelf: 'center', marginTop: 24 }}
        >
          Ask a question to start the conversation.
        </div>
      )}

      {messages.map((m) =>
        m.role === 'user' ? (
          <MessageBubble key={m.id} variant="user" message={m} />
        ) : (
          <MessageBubble key={m.id} variant="assistant" message={m} />
        ),
      )}

      {inFlight !== null && (
        <MessageBubble variant="assistant-streaming" text={inFlight.assistantText} />
      )}

      {lastError !== null && (
        <MessageBubble variant="error" code={lastError.code} raw={lastError.raw} />
      )}
    </div>
  );
}
