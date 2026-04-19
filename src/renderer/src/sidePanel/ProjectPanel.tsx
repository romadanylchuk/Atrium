import { useState, useEffect, useCallback, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { canSwitch } from './canSwitchSelector';
import { openOrNewProject } from '@renderer/launch/openOrNewProject';
import { buildInitPrompt } from '@renderer/launch/buildInitPrompt';
import { dispatchInitSpawn } from '@renderer/launch/LaunchGate';
import { NewProjectForm } from '@renderer/launch/NewProjectForm';
import { RecentsList } from '@renderer/launch/RecentsList';
import type { RecentProject } from '@shared/domain';
import type { InitFormFields } from '@renderer/launch/buildInitPrompt';
import type { SkillSpawnRequest } from '@shared/skill/spawn';

type PanelView = 'main' | 'new-project';

export function ProjectPanel(): JSX.Element {
  const project = useAtriumStore((s) => s.project);
  const setProject = useAtriumStore((s) => s.setProject);
  const switchProject = useAtriumStore((s) => s.switchProject);
  const terminalStatus = useAtriumStore((s) => s.terminal.status);
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
    <div data-testid="project-panel">
      <h2>{project?.projectName ?? 'No Project'}</h2>

      {error && <p role="alert">{error}</p>}

      <button
        type="button"
        disabled={openBusy || !switchAllowed}
        onClick={() => void handleOpen()}
      >
        Open
      </button>

      <section>
        <h3>Recent Projects</h3>
        <RecentsList
          recents={visibleRecents}
          onPick={(path) => {
            if (!switchAllowed) return;
            void handleRecentPick(path);
          }}
          currentPath={project?.rootPath}
        />
      </section>
    </div>
  );
}
