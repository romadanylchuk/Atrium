import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';

export function EdgeTab(): JSX.Element {
  const open = useAtriumStore((s) => s.openConsultationPanel);

  return (
    <div
      data-region="consultation-edge"
      style={{ flex: '0 0 28px', display: 'flex', alignItems: 'stretch' }}
    >
      <button
        type="button"
        data-testid="consultation-edge-tab"
        aria-label="Open consultation panel"
        onClick={open}
        style={{
          width: '100%',
          height: '100%',
          background: '#15151a',
          border: 'none',
          borderLeft: '1px solid #2a2a32',
          color: '#8a8a92',
          cursor: 'pointer',
          padding: '12px 0',
          fontFamily: 'inherit',
          fontSize: 11,
          letterSpacing: '0.1em',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          textTransform: 'uppercase',
        }}
      >
        Chat
      </button>
    </div>
  );
}
