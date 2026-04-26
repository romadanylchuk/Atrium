import type { JSX } from 'react';

type Props = {
  title: string;
  output: string;
  onClose: () => void;
  testid: string;
  zIndex?: number;
};

export function DetachedResultPopup({ title, output, onClose, testid, zIndex = 100 }: Props): JSX.Element {
  return (
    <div
      data-testid={testid}
      role="dialog"
      aria-label={title}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        zIndex,
      }}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid #444',
          borderRadius: 8,
          padding: 24,
          minWidth: 400,
          maxWidth: 560,
          width: '100%',
          color: '#cdd6f4',
        }}
      >
        <h2 style={{ margin: '0 0 16px' }}>{title} Output</h2>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            maxHeight: '60vh',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: 12,
            margin: 0,
          }}
        >
          {output}
        </pre>
        <div style={{ marginTop: 16 }}>
          <button type="button" data-testid={`${testid}-close`} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
