import { useRef, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { usePanelState } from './hooks/usePanelState';
import { useAutoCloseTimer } from './hooks/useAutoCloseTimer';
import { useConsultation } from './hooks/useConsultation';
import { ModelSelector } from './ModelSelector';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export function ConsultationPanel(): JSX.Element {
  const { state, isPinned, close, togglePin } = usePanelState();
  const projectRoot = useAtriumStore((s) => s.project?.rootPath ?? null);
  const panelRef = useRef<HTMLElement | null>(null);

  useConsultation(projectRoot);
  useAutoCloseTimer(panelRef, {
    enabled: state.kind === 'open-unpinned' || state.kind === 'preview',
    onExpire: close,
  });

  const isPreview = state.kind === 'preview';

  return (
    <aside
      ref={panelRef}
      data-region="consultation-panel"
      data-panel-kind={state.kind}
      style={{
        flex: '0 0 400px',
        display: 'flex',
        flexDirection: 'column',
        background: '#15151a',
        borderLeft: '1px solid #2a2a32',
        opacity: isPreview ? 0.92 : 1,
      }}
    >
      <header
        data-testid="consultation-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid #2a2a32',
          background: '#1a1a1f',
        }}
      >
        <span style={{ fontSize: 12, color: '#e6e6e6', fontWeight: 500 }}>Chat</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ModelSelector />
          <button
            type="button"
            data-testid="consultation-pin-button"
            data-pinned={isPinned ? 'true' : 'false'}
            aria-label={isPinned ? 'Unpin panel' : 'Pin panel'}
            onClick={togglePin}
            style={{
              background: 'transparent',
              border: '0.5px solid #3a3a42',
              borderRadius: 4,
              color: isPinned ? '#5b8fd4' : '#8a8a92',
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            type="button"
            data-testid="consultation-close-button"
            aria-label="Close panel"
            onClick={close}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8a8a92',
              fontSize: 14,
              padding: '0 4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </header>

      <MessageList />
      <ChatInput />
    </aside>
  );
}
