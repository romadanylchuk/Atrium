import type { JSX } from 'react';
import { useToastStore } from '@renderer/store/toastStore';

export function ToastContainer(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-container"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.kind}`}
          role="alert"
          aria-live="assertive"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            background: toast.kind === 'error' ? '#3b1c1c' : '#1c2b3b',
            color: toast.kind === 'error' ? '#f38ba8' : '#89dceb',
            border: `1px solid ${toast.kind === 'error' ? '#f38ba8' : '#89dceb'}`,
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'auto',
            maxWidth: '360px',
          }}
        >
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 2px',
              lineHeight: 1,
              opacity: 0.7,
            }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
