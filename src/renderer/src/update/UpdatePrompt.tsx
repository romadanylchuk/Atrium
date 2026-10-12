import { useEffect, useState, type JSX } from 'react';
import type { UpdateStatus } from '@shared/update';
import { useAtriumStore } from '@renderer/store/atriumStore';

const BTN: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid #444',
  background: 'transparent',
  color: '#cdd6f4',
};
const PRIMARY_BTN: React.CSSProperties = {
  ...BTN,
  background: '#5b8fd4',
  borderColor: '#5b8fd4',
  color: '#0f0f13',
  fontWeight: 600,
};

/**
 * Popup offering to install a newer Atrium release. Driven entirely by the main-process
 * update service: dev builds never leave `idle`, so this renders nothing there.
 * "Later" hides the offer for that version until the next launch.
 */
export function UpdatePrompt(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const terminalBusy = useAtriumStore(
    (s) => s.terminal.status === 'active' || s.terminal.status === 'spawning',
  );

  useEffect(() => {
    let cancelled = false;
    // The first check may have finished before this component subscribed.
    void window.atrium.update.getStatus().then((r) => {
      if (!cancelled && r.ok) setStatus(r.data);
    });
    const off = window.atrium.update.onStatus((next) => {
      setStatus(next);
      if (next.kind === 'error') setErrorDismissed(false);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  if (status.kind === 'idle') return null;
  if (status.kind === 'available' && status.version === dismissedVersion) return null;
  if (status.kind === 'error' && errorDismissed) return null;

  let title: string;
  let body: JSX.Element;
  let actions: JSX.Element;

  switch (status.kind) {
    case 'available':
      title = 'Update available';
      body = (
        <>
          <p style={{ margin: 0 }}>
            Atrium <strong>{status.version}</strong> is available — you have {status.currentVersion}.
          </p>
          {status.canAutoInstall ? (
            terminalBusy && (
              <p style={{ margin: '8px 0 0', color: '#d4824a' }}>
                Restarting will end the running terminal session.
              </p>
            )
          ) : (
            <p style={{ margin: '8px 0 0', opacity: 0.7 }}>
              This build can't update itself. Download the new installer from the release page.
            </p>
          )}
        </>
      );
      actions = (
        <>
          <button type="button" style={BTN} onClick={() => setDismissedVersion(status.version)}>
            Later
          </button>
          <button
            type="button"
            data-testid="update-install"
            style={PRIMARY_BTN}
            onClick={() => void window.atrium.update.download()}
          >
            {status.canAutoInstall ? 'Install and restart' : 'Download'}
          </button>
        </>
      );
      break;
    case 'downloading': {
      const pct = Math.max(0, Math.min(100, Math.round(status.percent)));
      title = `Downloading Atrium ${status.version}`;
      body = (
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ height: 6, borderRadius: 3, background: '#2a2a32', overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: '#5b8fd4', transition: 'width 200ms' }} />
        </div>
      );
      actions = <span style={{ fontSize: 12, opacity: 0.7 }}>{pct}%</span>;
      break;
    }
    case 'downloaded':
      title = `Installing Atrium ${status.version}`;
      body = <p style={{ margin: 0 }}>Restarting…</p>;
      actions = <></>;
      break;
    case 'error':
      title = 'Update failed';
      body = <p style={{ margin: 0, wordBreak: 'break-word' }}>{status.message}</p>;
      actions = (
        <>
          <button type="button" style={BTN} onClick={() => setErrorDismissed(true)}>
            Close
          </button>
          <button
            type="button"
            style={PRIMARY_BTN}
            onClick={() => void window.atrium.update.openReleasePage()}
          >
            Open download page
          </button>
        </>
      );
      break;
  }

  return (
    <div
      data-testid="update-prompt"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid #444',
          borderRadius: 8,
          padding: 20,
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          color: '#cdd6f4',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>{title}</h2>
        {body}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 }}>
          {actions}
        </div>
      </div>
    </div>
  );
}
