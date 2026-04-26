import { useEffect, useRef, useCallback, type JSX } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useAtriumStore } from '../store/atriumStore';
import { decideNextTerminalState, resolveInitOutcome } from './terminalState';
import { XTERM_THEME, XTERM_FONT_FAMILY } from './xtermTheme';
import { decideClipboardAction } from './clipboardKeymap';
import { encodeBracketedPaste } from './bracketedPaste';
import 'xterm/css/xterm.css';

declare global {
  interface Window {
    __e2e_terminalOutput?: string;
  }
}

const RESIZE_DEBOUNCE_MS = 150;

export function TerminalModal(): JSX.Element | null {
  const terminal = useAtriumStore((s) => s.terminal);
  const setTerminal = useAtriumStore((s) => s.setTerminal);
  const setFullscreen = useAtriumStore((s) => s.setFullscreen);
  const _autoDismissExited = useAtriumStore((s) => s._autoDismissExited);
  const setProject = useAtriumStore((s) => s.setProject);
  const clearPendingInit = useAtriumStore((s) => s.clearPendingInit);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const hasEmittedActiveRef = useRef(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { id, status, fullscreen } = terminal;

  const visible = status === 'spawning' || status === 'active' || status === 'exited';

  // -------------------------------------------------------------------------
  // Mount / unmount xterm instance when modal becomes visible
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    if (!containerRef.current) return;

    const xterm = new Terminal({
      theme: XTERM_THEME,
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: 13,
      cursorStyle: 'block',
      allowTransparency: false,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);
    fitAddon.fit();

    xterm.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
      const selection = xterm.hasSelection() ? xterm.getSelection() : '';
      const { id: currentId, status: currentStatus } = useAtriumStore.getState().terminal;
      const action = decideClipboardAction(e, { hasSelection: selection.length > 0, status: currentStatus });
      switch (action.kind) {
        case 'passthrough':
          return true;
        case 'swallow':
          e.preventDefault();
          return false;
        case 'copy-selection':
          e.preventDefault();
          void navigator.clipboard.writeText(selection).catch(() => {});
          xterm.clearSelection();
          return false;
        case 'paste':
          e.preventDefault();
          void navigator.clipboard
            .readText()
            .then((text) => {
              if (!text || !currentId) return;
              if (useAtriumStore.getState().terminal.status !== 'active') return;
              const wrapped = encodeBracketedPaste(text);
              if (!wrapped) return;
              const enc = new TextEncoder().encode(wrapped);
              window.atrium.terminal.write(currentId, enc.buffer);
            })
            .catch(() => {});
          return false;
        default: {
          const _exhaustive: never = action;
          void _exhaustive;
          return true;
        }
      }
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    hasEmittedActiveRef.current = false;

    return () => {
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [visible]);

  // -------------------------------------------------------------------------
  // Subscribe to terminal IPC events once we have an id
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!id || !visible) return;

    const offData = window.atrium.terminal.onData(id, (data) => {
      xtermRef.current?.write(new Uint8Array(data));

      // E2E test hook: accumulate raw terminal output for Playwright assertions.
      // __ATRIUM_E2E__ is a build-time constant — false in production, tree-shaken out.
      if (__ATRIUM_E2E__) {
        const text = new TextDecoder().decode(new Uint8Array(data));
        window.__e2e_terminalOutput = (window.__e2e_terminalOutput ?? '') + text;
      }

      const nextStatus = decideNextTerminalState(
        useAtriumStore.getState().terminal.status,
        hasEmittedActiveRef.current,
      );
      if (nextStatus === 'active') {
        hasEmittedActiveRef.current = true;
        setTerminal({ status: 'active', id });
      }
    });

    const offExit = window.atrium.terminal.onExit(id, (code) => {
      xtermRef.current?.write(`\r\n[process exited with code ${code ?? 'null'}]\r\n`);

      const current = useAtriumStore.getState().terminal.status;
      if (current === 'active' || current === 'spawning') {
        setTerminal({ status: 'exited', id });
      }

      // Init-flow completion: if this terminal was an init spawn, re-check project
      const pending = useAtriumStore.getState().pendingInit;
      if (pending && pending.terminalId === id) {
        void (async () => {
          const openResult = await window.atrium.project.open(pending.cwd);
          const outcome = resolveInitOutcome(openResult);

          if (outcome.kind === 'success' && openResult.ok) {
            setProject(openResult.data);
            clearPendingInit();
            _autoDismissExited();
          } else if (outcome.kind === 'not-arch-project') {
            clearPendingInit();
            // source='gate' → stay on gate (do nothing; gate visible when project===null)
            // source='panel' → stay on current project
          } else {
            clearPendingInit();
          }
        })();
      }
    });

    const offError = window.atrium.terminal.onError(id, (err) => {
      xtermRef.current?.write(`\r\n[error: ${err.message}]\r\n`);

      const current = useAtriumStore.getState().terminal.status;
      if (current === 'active' || current === 'spawning') {
        setTerminal({ status: 'exited', id });
      }
    });

    // Outbound keystrokes → pty
    const disposeInput = xtermRef.current?.onData((data) => {
      const enc = new TextEncoder().encode(data);
      window.atrium.terminal.write(id, enc.buffer);
    });

    return () => {
      offData();
      offExit();
      offError();
      disposeInput?.dispose();
    };
  }, [id, visible, setTerminal, setProject, clearPendingInit, _autoDismissExited]);

  // -------------------------------------------------------------------------
  // Resize handling
  // -------------------------------------------------------------------------
  const handleResize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      const fit = fitAddonRef.current;
      const xterm = xtermRef.current;
      if (!fit || !xterm) return;
      fit.fit();
      if (id) window.atrium.terminal.resize(id, xterm.cols, xterm.rows);
    }, RESIZE_DEBOUNCE_MS);
  }, [id]);

  useEffect(() => {
    if (!visible) return;
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [visible, handleResize]);

  // Refit on fullscreen toggle
  useEffect(() => {
    if (!visible) return;
    handleResize();
  }, [fullscreen, visible, handleResize]);

  // -------------------------------------------------------------------------
  // Keyboard: Escape closes when exited
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'exited') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') _autoDismissExited();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, _autoDismissExited]);

  if (!visible) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: fullscreen ? 0 : '8px',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    background: '#1a1a1a',
    border: fullscreen ? 'none' : '1px solid #444',
    borderRadius: fullscreen ? 0 : 4,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: '#2d2d2d',
    borderBottom: '1px solid #444',
    flexShrink: 0,
    userSelect: 'none',
  };

  const btnStyle: React.CSSProperties = {
    padding: '2px 10px',
    fontSize: 12,
    cursor: 'pointer',
    background: '#444',
    color: '#d4d4d4',
    border: '1px solid #666',
    borderRadius: 3,
  };

  return (
    <div style={overlayStyle} data-testid="terminal-modal" aria-label="Terminal">
      <div style={headerStyle}>
        <span style={{ flex: 1, fontSize: 12, color: '#aaa' }}>
          Terminal {status === 'exited' ? '(exited)' : status === 'spawning' ? '(spawning…)' : ''}
        </span>

        <button
          type="button"
          style={btnStyle}
          aria-label="Toggle fullscreen"
          onClick={() => setFullscreen(!fullscreen)}
        >
          {fullscreen ? 'Restore' : 'Fullscreen'}
        </button>

        {status === 'active' && (
          <button
            type="button"
            style={{ ...btnStyle, background: '#5a1a1a', borderColor: '#a33' }}
            aria-label="Kill terminal"
            onClick={() => {
              if (id) void window.atrium.terminal.kill(id);
            }}
          >
            Kill
          </button>
        )}

        {status === 'exited' && (
          <button
            type="button"
            style={{ ...btnStyle, background: '#2a3a2a', borderColor: '#4a7a4a' }}
            aria-label="Close terminal"
            onClick={() => _autoDismissExited()}
          >
            Close
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', padding: 4 }}
        data-testid="xterm-container"
      />
    </div>
  );
}
