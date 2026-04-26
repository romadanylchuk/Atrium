import { useState, useEffect, useCallback, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { canSwitch } from './canSwitchSelector';
import { openOrNewProject } from '@renderer/launch/openOrNewProject';
import { buildInitPrompt } from '@renderer/launch/buildInitPrompt';
import { dispatchInitSpawn } from '@renderer/launch/LaunchGate';
import { NewProjectForm } from '@renderer/launch/NewProjectForm';
import { formatRelativeTime } from '@renderer/utils/relativeTime';
import type { RecentProject } from '@shared/domain';
import type { InitFormFields } from '@renderer/launch/buildInitPrompt';
import type { SkillSpawnRequest } from '@shared/skill/spawn';

type PanelView = 'main' | 'new-project';

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6a6a72',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

export function ProjectPanel(): JSX.Element {
  const project = useAtriumStore((s) => s.project);
  const setProject = useAtriumStore((s) => s.setProject);
  const switchProject = useAtriumStore((s) => s.switchProject);
  const terminalStatus = useAtriumStore((s) => s.terminal.status);
  const claudeStatus = useAtriumStore((s) => s.claudeStatus);
  const claudeInfo = useAtriumStore((s) => s.claudeInfo);
  const pluginStatus = useAtriumStore((s) => s.pluginStatus);
  const pluginInfo = useAtriumStore((s) => s.pluginInfo);
  const pushToast = useToastStore((s) => s.pushToast);

  const switchAllowed = canSwitch(terminalStatus);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [view, setView] = useState<PanelView>('main');
  const [newProjectCwd, setNewProjectCwd] = useState('');
  const [openBusy, setOpenBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.atrium.project.getRecents().then((r) => {
      if (r.ok) setRecents(r.data.slice(0, 5));
    });
  }, [project]);

  const handleOpen = useCallback(async () => {
    setOpenBusy(true);
    setError(null);

    const pickerResult = await window.atrium.dialog.openFolder();
    if (!pickerResult.ok || pickerResult.data === null) {
      setOpenBusy(false);
      return;
    }

    const path = pickerResult.data;
    const outcome = await openOrNewProject(path, (p) => window.atrium.project.open(p));

    if (outcome.kind === 'opened') {
      setProject(outcome.state);
      setOpenBusy(false);
    } else if (outcome.kind === 'new') {
      setNewProjectCwd(outcome.cwd);
      setView('new-project');
      setOpenBusy(false);
    } else {
      setError(outcome.message);
      setOpenBusy(false);
      pushToast(outcome.message, 'error');
    }
  }, [setProject, pushToast]);

  const handleRecentPick = useCallback(
    async (path: string) => {
      setError(null);
      const r = await switchProject(path);
      if (!r.ok) {
        setError(r.error.message);
        pushToast(r.error.message, 'error');
      }
    },
    [switchProject, pushToast],
  );

  const handleNewProjectSubmit = useCallback(async (fields: InitFormFields & { cwd: string }) => {
    const prompt = buildInitPrompt(fields);
    const req: SkillSpawnRequest = { skill: 'init', cwd: fields.cwd, prompt };
    const result = await dispatchInitSpawn(req, 'panel');
    if (!result.ok) {
      pushToast(result.error.message, 'error');
    }
    setView('main');
  }, [pushToast]);

  const visibleRecents = recents.filter((r) => r.path !== project?.rootPath);

  let claudeLine: string;
  if (claudeStatus === 'healthy') {
    claudeLine = claudeInfo ? `claude v${claudeInfo.version} · healthy` : 'claude · healthy';
  } else if (claudeStatus === 'unreachable') {
    claudeLine = 'claude · unreachable';
  } else {
    claudeLine = 'claude · checking';
  }

  let pluginLine: string;
  if (pluginStatus === 'present') {
    pluginLine = pluginInfo ? `architector v${pluginInfo.version} · present` : 'architector · present';
  } else if (pluginStatus === 'missing') {
    pluginLine = 'architector · missing';
  } else if (pluginStatus === 'list-unavailable') {
    pluginLine = 'architector · list-unavailable';
  } else if (pluginStatus === 'unknown') {
    pluginLine = 'architector · unknown';
  } else {
    pluginLine = 'architector · checking';
  }

  if (view === 'new-project') {
    return (
      <div data-testid="project-panel">
        <NewProjectForm
          initialPath={newProjectCwd}
          onSubmit={(fields) => void handleNewProjectSubmit(fields)}
        />
        <button type="button" onClick={() => setView('main')}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="project-panel"
      style={{
        background: '#15151a',
        borderLeft: '1px solid #2a2a32',
        padding: '16px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <section>
        <div role="heading" aria-level={2} style={sectionHeaderStyle}>PROJECT</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: '#e6e6e6' }}>
          {project?.projectName ?? 'No project'}
        </div>
        <div style={{ fontSize: '11px', color: '#8a8a92', wordBreak: 'break-all' }}>
          {project?.rootPath ?? ''}
        </div>
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          disabled={openBusy || !switchAllowed}
          onClick={() => void handleOpen()}
          style={{
            width: '100%',
            background: '#2a2a32',
            border: '0.5px solid #3a3a42',
            borderRadius: '6px',
            padding: '8px',
            fontSize: '12px',
            color: '#e6e6e6',
            cursor: 'pointer',
            marginTop: '8px',
          }}
        >
          Open project…
        </button>
      </section>

      <section>
        <div role="heading" aria-level={2} style={sectionHeaderStyle}>RECENT</div>
        {visibleRecents.length === 0 ? (
          <p style={{ fontSize: '11px', color: '#6a6a72' }}>No recent projects.</p>
        ) : (
          visibleRecents.map((r) => (
            <button
              key={r.path}
              type="button"
              disabled={!switchAllowed}
              onClick={() => void handleRecentPick(r.path)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'transparent',
                border: 'none',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '12px', color: '#e6e6e6' }}>{r.name}</span>
              <span style={{ fontSize: '10px', color: '#6a6a72' }}>
                {formatRelativeTime(r.lastOpened)}
              </span>
            </button>
          ))
        )}
      </section>

      <div
        data-testid="sidebar-health-line"
        style={{ fontSize: '10px', color: '#4a4a52', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}
      >
        <div>{claudeLine}</div>
        <div>{pluginLine}</div>
      </div>

      <style>{`
        [data-testid="project-panel"] button:not(:disabled):hover {
          background: #1a1a1f !important;
        }
        [data-testid="project-panel"] button:focus-visible {
          outline: 1px solid #3a3a42;
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
