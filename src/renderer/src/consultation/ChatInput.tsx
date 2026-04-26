import { useState, type JSX, type KeyboardEvent } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';

export function ChatInput(): JSX.Element {
  const inFlight = useAtriumStore((s) => s.consultation.inFlight);
  const sendMessage = useAtriumStore((s) => s.sendConsultationMessage);
  const cancel = useAtriumStore((s) => s.cancelConsultationInFlight);
  const [text, setText] = useState('');

  const isStreaming = inFlight !== null;

  function handleSubmit(): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    if (isStreaming) return;
    setText('');
    void sendMessage(trimmed);
  }

  function handleKeyDown(ev: KeyboardEvent<HTMLTextAreaElement>): void {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      data-testid="consultation-chat-input"
      style={{
        display: 'flex',
        gap: 6,
        padding: 8,
        borderTop: '1px solid #2a2a32',
        background: '#15151a',
      }}
    >
      <textarea
        data-testid="consultation-chat-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isStreaming}
        rows={2}
        placeholder="Ask…"
        style={{
          flex: 1,
          resize: 'none',
          background: '#1a1a1f',
          color: '#e6e6e6',
          border: '0.5px solid #3a3a42',
          borderRadius: 4,
          padding: '6px 8px',
          fontFamily: 'inherit',
          fontSize: 12,
          outline: 'none',
        }}
      />
      {isStreaming ? (
        <button
          type="button"
          data-testid="consultation-cancel-button"
          onClick={() => void cancel()}
          style={{
            background: '#2a2a32',
            border: '0.5px solid #3a3a42',
            borderRadius: 4,
            color: '#e6e6e6',
            fontSize: 11,
            padding: '0 12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          data-testid="consultation-send-button"
          onClick={handleSubmit}
          disabled={text.trim().length === 0}
          style={{
            background: '#5b8fd4',
            border: 'none',
            borderRadius: 4,
            color: '#0f0f12',
            fontSize: 11,
            fontWeight: 500,
            padding: '0 12px',
            cursor: text.trim().length === 0 ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: text.trim().length === 0 ? 0.5 : 1,
          }}
        >
          Send
        </button>
      )}
    </div>
  );
}
