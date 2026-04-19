import type { JSX } from 'react';
import type { ProjectState } from '@shared/domain';

type Props = {
  project: ProjectState;
  canContinue: boolean;
  onContinue: () => void;
  onClose: () => void;
};

export function FinalizePanel({ project, canContinue, onContinue, onClose }: Props): JSX.Element {
  return (
    <div
      data-testid="finalize-panel"
      role="dialog"
      aria-label="Finalize Project"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        zIndex: 100,
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
        <h2 style={{ margin: '0 0 4px' }}>Finalize — {project.projectName}</h2>
        <p style={{ margin: '0 0 16px', opacity: 0.8 }}>
          This will run the finalize skill on the selected nodes. Claude Code will review them and
          produce feature briefs + a prioritised todo list.
        </p>
        <p style={{ margin: '0 0 16px', opacity: 0.6, fontSize: 12 }}>
          {project.nodes.length} nodes · {project.connections.length} connections
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            data-testid="finalize-panel-continue"
            disabled={!canContinue}
            onClick={onContinue}
          >
            Continue
          </button>
          <button
            type="button"
            data-testid="finalize-panel-close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
