import { useEffect, useRef, useState, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { CONSULTATION_MODELS, type ConsultationModel } from '@shared/index';

export function NewSessionButton(): JSX.Element {
  const startNewSession = useAtriumStore((s) => s.startNewConsultationSession);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleDocMouseDown(ev: MouseEvent): void {
      const node = wrapRef.current;
      if (node === null) return;
      if (ev.target instanceof Node && !node.contains(ev.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [open]);

  function handlePick(model: ConsultationModel): void {
    setOpen(false);
    void startNewSession(model);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        data-testid="consultation-new-session-button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: '0.5px solid #3a3a42',
          borderRadius: 4,
          color: '#8a8a92',
          fontSize: 11,
          padding: '4px 8px',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        New session
      </button>
      {open && (
        <div
          role="menu"
          data-testid="consultation-new-session-menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#1a1a1f',
            border: '0.5px solid #3a3a42',
            borderRadius: 4,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 100,
            zIndex: 10,
          }}
        >
          {CONSULTATION_MODELS.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitem"
              data-testid={`consultation-new-session-pick-${m}`}
              onClick={() => handlePick(m)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e6e6e6',
                fontSize: 11,
                padding: '6px 10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
