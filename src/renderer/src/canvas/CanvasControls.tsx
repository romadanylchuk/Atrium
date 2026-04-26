import { useReactFlow } from 'reactflow';
import { useAtriumStore } from '../store/atriumStore';

const BTN_STYLE: React.CSSProperties = {
  width: 26,
  height: 26,
  background: 'rgba(30,30,38,0.9)',
  border: '0.5px solid #3a3a42',
  borderRadius: 4,
  color: '#8a8a92',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

function ZoomInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

function FitViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,6 2,2 6,2" />
      <polyline points="10,2 14,2 14,6" />
      <polyline points="14,10 14,14 10,14" />
      <polyline points="6,14 2,14 2,10" />
    </svg>
  );
}

function RelayoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 3a6 6 0 1 1-2.5-1.5" />
      <polyline points="10,1 13,3 11,6" />
    </svg>
  );
}

export function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const triggerRelayout = useAtriumStore((s) => s.triggerRelayout);

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 5,
      }}
    >
      <style>{`
        [data-canvas-ctrl]:hover { background: rgba(40,40,50,0.95) !important; }
        [data-canvas-ctrl]:focus-visible { outline: 1px solid #3a3a42; outline-offset: 1px; }
      `}</style>
      <button
        type="button"
        data-testid="canvas-ctrl-zoom-in"
        data-canvas-ctrl="true"
        style={BTN_STYLE}
        onClick={() => zoomIn()}
        aria-label="Zoom in"
      >
        <ZoomInIcon />
      </button>
      <button
        type="button"
        data-testid="canvas-ctrl-zoom-out"
        data-canvas-ctrl="true"
        style={BTN_STYLE}
        onClick={() => zoomOut()}
        aria-label="Zoom out"
      >
        <ZoomOutIcon />
      </button>
      <button
        type="button"
        data-testid="canvas-ctrl-fit"
        data-canvas-ctrl="true"
        style={BTN_STYLE}
        onClick={() => fitView({ padding: 0.2 })}
        aria-label="Fit to view"
      >
        <FitViewIcon />
      </button>
      <button
        type="button"
        data-testid="canvas-ctrl-relayout"
        data-canvas-ctrl="true"
        style={BTN_STYLE}
        onClick={() => triggerRelayout()}
        aria-label="Auto layout"
      >
        <RelayoutIcon />
      </button>
    </div>
  );
}
