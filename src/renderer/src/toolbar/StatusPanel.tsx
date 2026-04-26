import type { JSX } from 'react';
import type { NodeMaturity } from '@shared/domain';
import type { ProjectState } from '@shared/domain';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { dispatchDetachedSkill } from '@renderer/skill/dispatchDetachedSkill';

const MATURITY_ORDER: NodeMaturity[] = ['raw-idea', 'explored', 'decided', 'ready'];

type Props = {
  project: ProjectState;
  onClose: () => void;
};

export function StatusPanel({ project, onClose }: Props): JSX.Element {
  const detachedStatusKind = useAtriumStore((s) => s.detachedRuns.status.kind);

  const byMaturity = new Map<string, string[]>();
  for (const n of project.nodes) {
    const group = byMaturity.get(n.maturity) ?? [];
    group.push(n.name);
    byMaturity.set(n.maturity, group);
  }

  const groups = MATURITY_ORDER.filter((m) => byMaturity.has(m));
  const unknownGroups = Array.from(byMaturity.keys()).filter(
    (m) => !MATURITY_ORDER.includes(m as NodeMaturity),
  );

  return (
    <div
      data-testid="status-panel"
      role="dialog"
      aria-label="Project Status"
      style={{
        position: 'absolute',
        inset: 0,
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
        <h2 style={{ margin: '0 0 4px' }}>{project.projectName}</h2>
        <p style={{ margin: '0 0 16px', opacity: 0.6, fontSize: 12 }}>
          {project.nodes.length} nodes · {project.connections.length} connections
        </p>

        {[...groups, ...unknownGroups].map((maturity) => {
          const names = byMaturity.get(maturity) ?? [];
          return (
            <details key={maturity} open style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {maturity} ({names.length})
              </summary>
              <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                {names.map((name) => (
                  <li key={name} style={{ fontSize: 13, marginBottom: 2 }}>
                    {name}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}

        {project.nodes.length === 0 && (
          <p style={{ opacity: 0.6 }}>No nodes in this project.</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            data-testid="status-panel-close"
            onClick={onClose}
          >
            Close
          </button>

          <button
            type="button"
            data-testid="status-panel-more"
            disabled={detachedStatusKind === 'waiting'}
            onClick={() => {
              useAtriumStore.getState().clearDetachedRunError('status');
              void dispatchDetachedSkill({ skill: 'status', cwd: project.rootPath });
            }}
          >
            {detachedStatusKind === 'waiting' ? 'Waiting…' : 'More Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
