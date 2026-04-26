import { useState, useEffect, useCallback, type JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { formatRelativeTime } from '@renderer/utils/relativeTime';
import type { RecentProject } from '@shared/domain';
import type { SkillSpawnRequest } from '@shared/skill/spawn';
import type { TerminalId, TerminalErrorCode, SkillErrorCode } from '@shared/index';
import type { Result } from '@shared/result';
import { dispatchSkill } from '@renderer/skill/dispatchSkill';
import { NewProjectForm } from './NewProjectForm';
import { openOrNewProject } from './openOrNewProject';
import { buildInitPrompt } from './buildInitPrompt';
import type { InitFormFields } from './buildInitPrompt';

type GateBody =
  | { view: 'main'; error?: string; openBusy: boolean }
  | { view: 'new-project'; cwd: string };

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#6a6a72',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

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

const DEP_TOOLTIP = 'Install required dependencies first';

export function LaunchGate(): JSX.Element {
  const setProject = useAtriumStore((s) => s.setProject);
  const switchProject = useAtriumStore((s) => s.switchProject);
  const claudeStatus = useAtriumStore((s) => s.claudeStatus);
  const claudeInfo = useAtriumStore((s) => s.claudeInfo);
  const pluginStatus = useAtriumStore((s) => s.pluginStatus);
  const pluginInfo = useAtriumStore((s) => s.pluginInfo);
  const installState = useAtriumStore((s) => s.installState);
  const _recheckHealth = useAtriumStore((s) => s._recheckHealth);
  const _startInstall = useAtriumStore((s) => s._startInstall);
  const _failInstall = useAtriumStore((s) => s._failInstall);
  const _resetInstall = useAtriumStore((s) => s._resetInstall);
  const _setPlugin = useAtriumStore((s) => s._setPlugin);
  const pushToast = useToastStore((s) => s.pushToast);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [body, setBody] = useState<GateBody>({ view: 'main', openBusy: false });
  const [switchError, setSwitchError] = useState<string | null>(null);

  const gated = claudeStatus !== 'healthy' || pluginStatus !== 'present';

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

  const handleInstall = useCallback(async () => {
    _startInstall();
    const result = await window.atrium.health.installPlugin();
    if (!result.ok) {
      pushToast(result.error.message, 'error');
      _resetInstall();
      return;
    }
    const outcome = result.data;
    if (outcome.kind === 'success') {
      _setPlugin({ status: 'present', info: outcome.pluginInfo });
      _resetInstall();
    } else {
      _failInstall(outcome);
    }
  }, [_startInstall, _resetInstall, _setPlugin, _failInstall, pushToast]);

  const handleCancel = useCallback(() => {
    void window.atrium.health.cancelInstall();
    // The pending installPlugin promise resolves with INSTALL_CANCELLED → _failInstall is called
  }, []);

  const handleRetry = useCallback(() => {
    _resetInstall();
    void handleInstall();
  }, [_resetInstall, handleInstall]);

  let claudeLine: string;
  if (claudeStatus === 'healthy') {
    claudeLine = claudeInfo ? `claude v${claudeInfo.version} · healthy` : 'claude · healthy';
  } else if (claudeStatus === 'unreachable') {
    claudeLine = 'claude · unreachable';
  } else {
    claudeLine = 'claude · checking';
  }

  let architectorLine: string;
  if (pluginStatus === 'present') {
    architectorLine = pluginInfo
      ? `architector v${pluginInfo.version} · present`
      : 'architector · present';
  } else {
    architectorLine = `architector · ${pluginStatus}`;
  }

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
        background: '#0f0f13',
        zIndex: 100,
      }}
    >
      <div
        className="launch-gate-column"
        style={{
          width: '100%',
          maxWidth: 400,
          minWidth: 360,
          padding: '0 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          boxSizing: 'border-box',
        }}
      >
        <h1 style={{ fontSize: '32px', fontWeight: 500, color: '#e6e6e6', lineHeight: 1, margin: 0 }}>
          Atrium
        </h1>

        {body.view === 'main' && (
          <>
            <section>
              <div role="heading" aria-level={2} style={sectionHeaderStyle}>RECENT</div>
              {recents.length === 0 ? (
                <p style={{ fontSize: '11px', color: '#6a6a72', margin: 0 }}>No recent projects.</p>
              ) : (
                recents.map((r) => (
                  <button
                    key={r.path}
                    type="button"
                    disabled={gated}
                    title={gated ? DEP_TOOLTIP : undefined}
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
                      cursor: gated ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#e6e6e6', wordBreak: 'break-all' }}>
                      {r.name || r.path}
                    </span>
                    <span style={{ fontSize: '10px', color: '#6a6a72' }}>
                      {formatRelativeTime(r.lastOpened)}
                    </span>
                  </button>
                ))
              )}
              {switchError && (
                <p role="alert" style={{ color: '#f38ba8', fontSize: '12px', margin: '4px 0 0' }}>
                  {switchError}
                </p>
              )}
            </section>

            {gated && (
              <section aria-label="Dependencies">
                <div role="heading" aria-level={2} style={sectionHeaderStyle}>DEPENDENCIES</div>

                <p role="status" style={{ fontSize: '11px', color: '#8a8a92', margin: '0 0 2px' }}>
                  {claudeLine}
                </p>
                <p role="status" style={{ fontSize: '11px', color: '#8a8a92', margin: '0 0 8px' }}>
                  {architectorLine}
                </p>

                {claudeStatus === 'unreachable' && (
                  <p style={{ fontSize: '11px', color: '#8a8a92', lineHeight: 1.4, margin: '0 0 8px' }}>
                    Claude CLI not found.{' '}
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); void window.atrium.shell.openExternal('https://claude.ai/download'); }}
                      style={{ color: '#8a8aaa', textDecoration: 'underline', cursor: 'pointer' }}
                    >
                      Install Claude Code
                    </a>
                    , then Atrium will reconnect automatically.
                  </p>
                )}

                {claudeStatus === 'healthy' &&
                  (pluginStatus === 'missing' || pluginStatus === 'list-unavailable') &&
                  installState.kind === 'idle' && (
                    <button
                      type="button"
                      onClick={() => void handleInstall()}
                      style={{
                        width: '100%',
                        background: '#2a2a32',
                        border: '0.5px solid #3a3a42',
                        borderRadius: '6px',
                        padding: '8px',
                        fontSize: '12px',
                        color: '#e6e6e6',
                        cursor: 'pointer',
                        marginBottom: '8px',
                      }}
                    >
                      Install architector plugin
                    </button>
                  )}

                {installState.kind === 'installing' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#8a8a92' }}>Installing…</span>
                    <button
                      type="button"
                      onClick={handleCancel}
                      style={{
                        background: 'transparent',
                        border: '0.5px solid #3a3a42',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        color: '#8a8a92',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {installState.kind === 'failed' && (
                  <div style={{ marginBottom: '8px' }}>
                    <p style={{ fontSize: '11px', color: '#f38ba8', margin: '0 0 4px' }}>
                      {installState.failure.code === 'INSTALL_CANCELLED'
                        ? 'Cancelled'
                        : `Install failed at step ${installState.failure.step}`}
                    </p>
                    {installState.failure.code !== 'INSTALL_CANCELLED' &&
                      (installState.failure.stdout || installState.failure.stderr) && (
                        <pre
                          style={{
                            maxHeight: '200px',
                            overflow: 'auto',
                            background: '#1a1a1f',
                            border: '0.5px solid #3a3a42',
                            borderRadius: '4px',
                            padding: '6px',
                            fontSize: '10px',
                            color: '#8a8a92',
                            margin: '0 0 4px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {installState.failure.stdout}
                          {installState.failure.stderr ? `\n${installState.failure.stderr}` : ''}
                        </pre>
                      )}
                    <button
                      type="button"
                      onClick={handleRetry}
                      style={{
                        background: 'transparent',
                        border: '0.5px solid #3a3a42',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        color: '#8a8a92',
                        cursor: 'pointer',
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => _recheckHealth?.()}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0',
                    fontSize: '11px',
                    color: '#4a4a52',
                    cursor: 'pointer',
                  }}
                >
                  Re-check
                </button>
              </section>
            )}

            <section>
              <div role="heading" aria-level={2} style={sectionHeaderStyle}>OPEN</div>
              <button
                type="button"
                disabled={gated || body.openBusy}
                title={gated ? DEP_TOOLTIP : undefined}
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
                }}
              >
                Open project…
              </button>
              {body.error && (
                <p role="alert" style={{ color: '#f38ba8', fontSize: '12px', margin: '4px 0 0' }}>
                  {body.error}
                </p>
              )}
            </section>
          </>
        )}

        {body.view === 'new-project' && (
          <NewProjectForm
            initialPath={body.cwd}
            onSubmit={(fields) => void handleNewProjectSubmit(fields)}
          />
        )}

        <div
          data-testid="launch-health-line"
          style={{ fontSize: '10px', color: '#4a4a52', marginTop: 'auto' }}
        >
          <div>{claudeLine}</div>
          <div>{architectorLine}</div>
        </div>

        <style>{`
          .launch-gate-column button:not(:disabled):hover {
            background: #1a1a1f !important;
          }
          .launch-gate-column button:focus-visible {
            outline: 1px solid #3a3a42;
            outline-offset: 1px;
          }
        `}</style>
      </div>
    </div>
  );
}
