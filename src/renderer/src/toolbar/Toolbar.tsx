import { type JSX, useState } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { canSwitch } from '@renderer/sidePanel/canSwitchSelector';
import { dispatchSkill } from '@renderer/skill/dispatchSkill';
import { StatusPanel } from './StatusPanel';
import { FinalizePanel } from './FinalizePanel';
import type { SkillName } from '@shared/skill/composeCommand';

type ToolbarOverlayLocal = 'status' | 'finalize' | null;

export function Toolbar(): JSX.Element {
  const project = useAtriumStore((s) => s.project);
  const terminalStatus = useAtriumStore((s) => s.terminal.status);
  const pushToast = useToastStore((s) => s.pushToast);
  const [overlay, setOverlay] = useState<ToolbarOverlayLocal>(null);
  const [error, setError] = useState<string | null>(null);

  const switchAllowed = canSwitch(terminalStatus);

  async function handleSkill(skill: SkillName): Promise<void> {
    if (!project) return;
    setError(null);
    const selectedNodes = useAtriumStore.getState().selectedNodes;
    const nodes = Array.from(selectedNodes);
    const r = await dispatchSkill({ skill, nodes, cwd: project.rootPath });
    if (!r.ok) {
      setError(r.error.message);
      pushToast(r.error.message, 'error');
    }
  }

  async function handleFinalizeContinue(): Promise<void> {
    if (!project) return;
    setOverlay(null);
    await handleSkill('finalize');
  }

  return (
    <div
      data-testid="toolbar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        background: '#181825',
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          data-testid="toolbar-btn-explore"
          disabled={!switchAllowed}
          onClick={() => void handleSkill('explore')}
        >
          Explore
        </button>

        <button
          type="button"
          data-testid="toolbar-btn-decide"
          disabled={!switchAllowed}
          onClick={() => void handleSkill('decide')}
        >
          Decide
        </button>

        <button
          type="button"
          data-testid="toolbar-btn-map"
          disabled={!switchAllowed}
          onClick={() => void handleSkill('map')}
        >
          Map
        </button>

        <button
          type="button"
          data-testid="toolbar-btn-status"
          onClick={() => setOverlay('status')}
        >
          Status
        </button>

        <button
          type="button"
          data-testid="toolbar-btn-finalize"
          onClick={() => setOverlay('finalize')}
        >
          Finalize
        </button>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="toolbar-error"
          style={{ margin: '4px 0 0', color: '#f38ba8', fontSize: 12 }}
        >
          {error}
        </p>
      )}

      {overlay === 'status' && project && (
        <StatusPanel project={project} onClose={() => setOverlay(null)} />
      )}

      {overlay === 'finalize' && project && (
        <FinalizePanel
          project={project}
          canContinue={switchAllowed}
          onContinue={() => void handleFinalizeContinue()}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
