import { Component, type ErrorInfo, type ReactNode } from 'react';

const BTN: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid #444',
  background: 'transparent',
  color: '#cdd6f4',
};

type State = { error: Error | null; componentStack: string };

/**
 * Last-resort catch for render errors. Without it React unmounts the whole tree and the
 * window goes blank. The error is logged via console.error, which main writes to main.log.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentStack = info.componentStack ?? '';
    this.setState({ componentStack });
    console.error('[atrium:render] UI crashed:', error.stack ?? error.message, '\nComponent stack:', componentStack);
  }

  override render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        data-testid="error-boundary"
        role="alert"
        style={{
          position: 'fixed',
          inset: 0,
          overflow: 'auto',
          padding: 32,
          background: '#1e1e2e',
          color: '#cdd6f4',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Something went wrong in Atrium</h2>
        <p style={{ margin: '0 0 16px', opacity: 0.8 }}>
          The details below were saved to the log file. Reloading usually recovers.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" style={{ ...BTN, background: '#5b8fd4', borderColor: '#5b8fd4', color: '#0f0f13' }} onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" style={BTN} onClick={() => void window.atrium.shell.openLogsFolder()}>
            Open logs folder
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: '#11111b',
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 11,
          }}
        >
          {error.stack ?? error.message}
          {componentStack && `\n\nComponent stack:${componentStack}`}
        </pre>
      </div>
    );
  }
}
