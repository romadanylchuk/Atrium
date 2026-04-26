import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { ConsultationErrorCode, ConsultationMessage } from '@shared/index';

const USER_BG = '#1a1a1f';
const ASSISTANT_BG = '#15151a';
const ERROR_BG = '#2a1a1f';
const ERROR_BORDER = '#5a3030';
const ACCENT = '#5b8fd4';

const baseBubble: React.CSSProperties = {
  border: '0.5px solid #2a2a32',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 12,
  color: '#e6e6e6',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export type MessageBubbleProps =
  | { variant: 'user'; message: ConsultationMessage }
  | { variant: 'assistant'; message: ConsultationMessage }
  | { variant: 'assistant-streaming'; text: string }
  | { variant: 'error'; code: ConsultationErrorCode; raw?: string };

export function MessageBubble(props: MessageBubbleProps): JSX.Element {
  if (props.variant === 'user') {
    return (
      <div
        data-testid="consultation-bubble"
        data-variant="user"
        style={{
          ...baseBubble,
          background: USER_BG,
          alignSelf: 'flex-end',
          maxWidth: '85%',
        }}
      >
        {props.message.content}
      </div>
    );
  }

  if (props.variant === 'assistant') {
    return (
      <div
        data-testid="consultation-bubble"
        data-variant="assistant"
        style={{
          ...baseBubble,
          background: ASSISTANT_BG,
          alignSelf: 'flex-start',
          maxWidth: '85%',
        }}
      >
        {props.message.content}
      </div>
    );
  }

  if (props.variant === 'assistant-streaming') {
    return (
      <div
        data-testid="consultation-bubble"
        data-variant="assistant-streaming"
        style={{
          ...baseBubble,
          background: ASSISTANT_BG,
          alignSelf: 'flex-start',
          maxWidth: '85%',
          borderColor: ACCENT,
        }}
      >
        {props.text}
        {props.text.length === 0 ? <span style={{ opacity: 0.5 }}>…</span> : null}
      </div>
    );
  }

  return <ErrorBubble code={props.code} raw={props.raw} />;
}

function ErrorBubble({
  code,
  raw,
}: {
  code: ConsultationErrorCode;
  raw?: string;
}): JSX.Element {
  return (
    <div
      data-testid="consultation-bubble"
      data-variant="error"
      data-code={code}
      role="alert"
      style={{
        ...baseBubble,
        background: ERROR_BG,
        borderColor: ERROR_BORDER,
        alignSelf: 'flex-start',
        maxWidth: '90%',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ color: '#f3a8a8', fontSize: 11, fontWeight: 500 }}>{errorTitle(code)}</div>
      {raw !== undefined && raw.length > 0 && (
        <div style={{ color: '#a8a8b0', fontSize: 11 }}>{raw}</div>
      )}
      <ErrorAction code={code} />
    </div>
  );
}

function ErrorAction({ code }: { code: ConsultationErrorCode }): JSX.Element | null {
  const retryLastError = useAtriumStore((s) => s.retryLastConsultationError);
  const startNewSession = useAtriumStore((s) => s.startNewConsultationSession);
  const selectedModel = useAtriumStore((s) => s.consultation.selectedModel);

  switch (code) {
    case 'CLAUDE_NOT_FOUND':
      return (
        <ActionButton
          label="Install Claude Code"
          testid="consultation-error-action-install"
          onClick={() => openExternal('https://claude.com/product/claude-code')}
        />
      );
    case 'NOT_AUTHENTICATED':
      return (
        <ActionButton
          label="Sign in"
          testid="consultation-error-action-signin"
          onClick={() => openExternal('https://docs.claude.com/en/docs/claude-code/setup')}
        />
      );
    case 'QUOTA_EXCEEDED':
    case 'NETWORK_ERROR':
    case 'INVALID_OUTPUT':
    case 'BUDGET_EXCEEDED':
    case 'IO_FAILED':
    case 'INTERNAL':
    case 'SESSION_LOST':
      return (
        <ActionButton
          label="Retry"
          testid="consultation-error-action-retry"
          onClick={() => void retryLastError()}
        />
      );
    case 'CORRUPT':
      return (
        <ActionButton
          label="Start new session"
          testid="consultation-error-action-newsession"
          onClick={() => void startNewSession(selectedModel)}
        />
      );
    case 'SCHEMA_MISMATCH':
    case 'CANCELLED':
      return null;
    default:
      return null;
  }
}

function ActionButton({
  label,
  onClick,
  testid,
}: {
  label: string;
  onClick: () => void;
  testid: string;
}): JSX.Element {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{
        alignSelf: 'flex-start',
        background: '#3a2a2a',
        border: '0.5px solid #5a3a3a',
        borderRadius: 4,
        color: '#f3a8a8',
        fontSize: 11,
        padding: '4px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function errorTitle(code: ConsultationErrorCode): string {
  switch (code) {
    case 'CLAUDE_NOT_FOUND': return 'Claude Code not found';
    case 'NOT_AUTHENTICATED': return 'Not signed in';
    case 'QUOTA_EXCEEDED': return 'Quota exceeded';
    case 'NETWORK_ERROR': return 'Network error';
    case 'INVALID_OUTPUT': return 'Invalid response';
    case 'BUDGET_EXCEEDED': return 'Budget exceeded';
    case 'IO_FAILED': return 'I/O failed';
    case 'INTERNAL': return 'Internal error';
    case 'SESSION_LOST': return 'Session lost — started a new one';
    case 'CORRUPT': return 'Conversation file corrupt';
    case 'SCHEMA_MISMATCH': return 'Conversation schema mismatch';
    case 'CANCELLED': return 'Cancelled';
    default: return code;
  }
}
