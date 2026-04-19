import { useEffect, useState, type JSX } from 'react';
import { useAtriumStore } from '../store/atriumStore';
import { useToastStore } from '../store/toastStore';
import { computeTooltipPlacement } from './tooltipPlacement';
import { SkillButton } from './SkillButton';
import { canSwitch } from '../sidePanel/canSwitchSelector';

const TOOLTIP_WIDTH = 260;
const TOOLTIP_HEIGHT = 180;

type Props = {
  nodeScreenX: number;
  nodeScreenY: number;
};

function TooltipInner({ nodeScreenX, nodeScreenY }: Props): JSX.Element | null {
  const slug = useAtriumStore((s) => s.tooltipTarget);
  const project = useAtriumStore((s) => s.project);
  const terminalStatus = useAtriumStore((s) => s.terminal.status);
  const setTooltipTarget = useAtriumStore((s) => s.setTooltipTarget);
  const pushToast = useToastStore((s) => s.pushToast);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  const switchAllowed = canSwitch(terminalStatus);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setTooltipTarget(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setTooltipTarget]);

  if (!slug || !project) return null;

  const node = project.nodes.find((n) => n.slug === slug);
  if (!node) return null;

  const placement = computeTooltipPlacement({
    nodeScreenX,
    nodeScreenY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  const left =
    placement.side === 'right' ? nodeScreenX + 16 : nodeScreenX - TOOLTIP_WIDTH - 16;
  const top =
    placement.vAlign === 'bottom' ? nodeScreenY : nodeScreenY - TOOLTIP_HEIGHT;

  function handleSuccess() {
    setSpawnError(null);
    setTooltipTarget(null);
  }

  function handleError(code: string) {
    const msg = `Skill failed: ${code}`;
    setSpawnError(msg);
    pushToast(msg, 'error');
  }

  return (
    <div
      data-testid="node-tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        width: TOOLTIP_WIDTH,
        minHeight: TOOLTIP_HEIGHT,
        background: '#1e1e2e',
        color: '#cdd6f4',
        border: '1px solid rgba(205,214,244,0.2)',
        borderRadius: '8px',
        padding: '12px',
        zIndex: 1000,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        fontSize: '13px',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '4px' }}>{node.name}</div>
      <div
        data-testid="maturity-badge"
        style={{
          display: 'inline-block',
          fontSize: '11px',
          padding: '1px 6px',
          borderRadius: '4px',
          background: 'rgba(205,214,244,0.15)',
          marginBottom: '8px',
        }}
      >
        {node.maturity}
      </div>
      <div style={{ marginBottom: '10px', color: 'rgba(205,214,244,0.75)', fontSize: '12px' }}>
        {node.summary}
      </div>
      {spawnError && (
        <div
          data-testid="spawn-error"
          style={{ color: '#f38ba8', fontSize: '11px', marginBottom: '6px' }}
        >
          {spawnError}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px' }}>
        <SkillButton
          skill="explore"
          label="Explore"
          nodes={[slug]}
          cwd={project.rootPath}
          disabled={!switchAllowed}
          onSuccess={handleSuccess}
          onError={handleError}
        />
        <SkillButton
          skill="decide"
          label="Decide"
          nodes={[slug]}
          cwd={project.rootPath}
          disabled={!switchAllowed}
          onSuccess={handleSuccess}
          onError={handleError}
        />
        <SkillButton
          skill="map"
          label="Map"
          nodes={[slug]}
          cwd={project.rootPath}
          disabled={!switchAllowed}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      </div>
    </div>
  );
}

export function Tooltip(): JSX.Element | null {
  const slug = useAtriumStore((s) => s.tooltipTarget);
  const [nodeScreenPos, setNodeScreenPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!slug) {
      setNodeScreenPos(null);
      return;
    }
    // Position snapshotted at open; onPaneClick dismisses before pan.
    const el = document.querySelector(`[data-id="${slug}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setNodeScreenPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }, [slug]);

  if (!slug || !nodeScreenPos) return null;

  return <TooltipInner nodeScreenX={nodeScreenPos.x} nodeScreenY={nodeScreenPos.y} />;
}
