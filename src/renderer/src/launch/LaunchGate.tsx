import { useState, useEffect, useCallback, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import type { RecentProject } from '@shared/domain';
import type { SkillSpawnRequest } from '@shared/skill/spawn';
import type { TerminalId, TerminalErrorCode, SkillErrorCode } from '@shared/index';
import type { Result } from '@shared/result';
import { dispatchSkill } from '@renderer/skill/dispatchSkill';
import { HealthSection } from './HealthSection';
import { RecentsList } from './RecentsList';
import { NewProjectForm } from './NewProjectForm';
import { openOrNewProject } from './openOrNewProject';
import { buildInitPrompt } from './buildInitPrompt';
import type { InitFormFields } from './buildInitPrompt';

type GateBody =
  | { view: 'main'; error?: string; openBusy: boolean }
  | { view: 'new-project'; cwd: string };

export async function dispatchInitSpawn(
  req: SkillSpawnRequest,
  source: 'gate' | 'panel',
): Promise<Result<TerminalId, TerminalErrorCode | SkillErrorCode>> {
  const result = await dispatchSkill(req);
  if (result.ok) {
    useAtriumStore.getState().setPendingInit({ source, cwd: req.cwd, terminalId: result.data });
  }
  return result;
}

export function LaunchGate(): JSX.Element {
  const setProject = useAtriumStore((s) => s.setProject);
  const switchProject = useAtriumStore((s) => s.switchProject);
  const pushToast = useToastStore((s) => s.pushToast);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [body, setBody] = useState<GateBody>({ view: 'main', openBusy: false });
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    void window.atrium.project.getRecents().then((r) => {
      if (r.ok) setRecents(r.data.slice(0, 5));
    });
  }, []);

  const handleOpen = useCallback(async () => {
    setBody({ view: 'main', openBusy: true });

    const pickerResult = await window.atrium.dialog.openFolder();
    if (!pickerResult.ok || pickerResult.data === null) {
      setBody({ view: 'main', openBusy: false });
      return;
    }

    const path = pickerResult.data;
    const outcome = await openOrNewProject(path, (p) => window.atrium.project.open(p));

    if (outcome.kind === 'opened') {
      setProject(outcome.state);
    } else if (outcome.kind === 'new') {
      setBody({ view: 'new-project', cwd: outcome.cwd });
    } else {
      setBody({ view: 'main', openBusy: false, error: outcome.message });
      pushToast(outcome.message, 'error');
    }
  }, [setProject, pushToast]);

  const handleRecentPick = useCallback(
    async (path: string) => {
      setSwitchError(null);
      const r = await switchProject(path);
      if (!r.ok) {
        setSwitchError(r.error.message);
        pushToast(r.error.message, 'error');
      }
    },
    [switchProject, pushToast],
  );

  const handleNewProjectSubmit = useCallback(
    async (fields: InitFormFields & { cwd: string }) => {
      const prompt = buildInitPrompt(fields);
      const req: SkillSpawnRequest = { skill: 'init', cwd: fields.cwd, prompt };
      const result = await dispatchInitSpawn(req, 'gate');
      if (!result.ok) {
        pushToast(result.error.message, 'error');
      }
    },
    [pushToast],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100,
      }}
    >
      <div style={{ background: '#1e1e1e', padding: '2rem', minWidth: 400 }}>
        <h1>Atrium</h1>

        <HealthSection checkFn={() => window.atrium.health.checkClaude()} />

        {body.view === 'main' && (
          <>
            {body.error && <p role="alert">{body.error}</p>}
            {switchError && <p role="alert">{switchError}</p>}

            <section>
              <h2>Recent Projects</h2>
              <RecentsList recents={recents} onPick={(path) => { void handleRecentPick(path); }} />
            </section>

            <button type="button" disabled={body.openBusy} onClick={() => void handleOpen()}>
              Open
            </button>
          </>
        )}

        {body.view === 'new-project' && (
          <NewProjectForm
            initialPath={body.cwd}
            onSubmit={(fields) => void handleNewProjectSubmit(fields)}
          />
        )}
      </div>
    </div>
  );
}
