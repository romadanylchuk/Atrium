import { useCallback, useEffect, useRef, type JSX } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { XTERM_THEME, XTERM_FONT_FAMILY } from '@renderer/terminal/xtermTheme';
import { usePanelState } from './hooks/usePanelState';
import { useAutoCloseTimer } from './hooks/useAutoCloseTimer';
import { useConsultationTerminal } from './hooks/useConsultationTerminal';
import 'xterm/css/xterm.css';

const RESIZE_DEBOUNCE_MS = 150;

export function ConsultationPanel(): JSX.Element {
  const { state, close } = usePanelState();
  const projectRoot = useAtriumStore((s) => s.project?.rootPath ?? null);
  const { id, status } = useAtriumStore((s) => s.consultationTerminal);
  const clearConsultationTerminal = useAtriumStore((s) => s.clearConsultationTerminal);
  const setExited = useAtriumStore((s) => s.setConsultationTerminalExited);

  const panelRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useConsultationTerminal(projectRoot);

  useAutoCloseTimer(panelRef, {
    enabled: state.kind === 'open-unpinned' || state.kind === 'preview',
    onExpire: close,
  });

  // Mount/unmount xterm keyed on id
  useEffect(() => {
    if (!id || !containerRef.current) return;

    const xterm = new Terminal({
      theme: { ...XTERM_THEME, background: '#20202a' },
      fontFamily: XTERM_FONT_FAMILY,
      fontSize: 13,
      cursorStyle: 'block',
      allowTransparency: false,
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);
    fitAddon.fit();
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    const offData = window.atrium.terminal.onData(id, (data) => {
      xterm.write(new Uint8Array(data));
    });
    const offExit = window.atrium.terminal.onExit(id, (code) => {
      xterm.write(`\r\n[process exited with code ${code ?? 'null'}]\r\n`);
      setExited();
    });
    const offError = window.atrium.terminal.onError(id, (err) => {
      xterm.write(`\r\n[error: ${err.message}]\r\n`);
      setExited();
    });
    const disposeInput = xterm.onData((data) => {
      const enc = new TextEncoder().encode(data);
      window.atrium.terminal.write(id, enc.buffer);
    });

    return () => {
      offData();
      offExit();
      offError();
      disposeInput.dispose();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [id, setExited]);

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
    if (!id || !containerRef.current) return;
    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [id, handleResize]);

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
        <span style={{ fontSize: 12, color: '#e6e6e6', fontWeight: 500 }}>Consultation</span>
        {status === 'exited' && (
          <button
            type="button"
            data-testid="consultation-restart-button"
            aria-label="Restart consultation"
            onClick={clearConsultationTerminal}
            style={{
              marginLeft: 'auto',
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
            Restart
          </button>
        )}
      </header>
      {status === 'spawning' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#5a5a6a',
            fontSize: 12,
          }}
        >
          Connecting…
        </div>
      )}
      <div
        ref={containerRef}
        data-testid="consultation-xterm-container"
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: 4,
          background: '#20202a',
          display: status === 'spawning' ? 'none' : 'block',
        }}
      />
    </aside>
  );
}
