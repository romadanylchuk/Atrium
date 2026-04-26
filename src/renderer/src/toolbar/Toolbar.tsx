import { type JSX, useState } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { canSwitch } from '@renderer/sidePanel/canSwitchSelector';
import { dispatchSkill } from '@renderer/skill/dispatchSkill';
import { dispatchDetachedSkill } from '@renderer/skill/dispatchDetachedSkill';
import type { SkillName } from '@shared/skill/composeCommand';

type TabName = SkillName;

const HEALTH_DOT_COLOR: Record<'checking' | 'healthy' | 'unreachable', string> = {
  healthy: '#3ba55d',
  unreachable: '#e24b4a',
  checking: '#6a6a72',
};

export function Toolbar(): JSX.Element {
  const project = useAtriumStore((s) => s.project);
  const terminalStatus = useAtriumStore((s) => s.terminal.status);
  const claudeStatus = useAtriumStore((s) => s.claudeStatus);
  const projectName = useAtriumStore((s) => s.project?.projectName);
  const toolbarOverlay = useAtriumStore((s) => s.toolbarOverlay);
  const setToolbarOverlay = useAtriumStore((s) => s.setToolbarOverlay);
  const detachedRunAudit = useAtriumStore((s) => s.detachedRuns.audit);
  const lastDetachedError = useAtriumStore((s) => s.lastDetachedError);
  const clearDetachedRunError = useAtriumStore((s) => s.clearDetachedRunError);
  const pushToast = useToastStore((s) => s.pushToast);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabName | null>(null);

  const switchAllowed = canSwitch(terminalStatus);
  const auditWaiting = detachedRunAudit.kind === 'waiting';
  const effectiveError = error ?? lastDetachedError?.message ?? null;

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

  async function handleAudit(): Promise<void> {
    if (!project) return;
    setError(null);
    clearDetachedRunError('audit');
    await dispatchDetachedSkill({ skill: 'audit', cwd: project.rootPath });
  }

  function tabStyle(name: TabName, disabled: boolean, activeOverride?: boolean): React.CSSProperties {
    const isActive = activeOverride !== undefined ? activeOverride : activeTab === name;
    return {
      border: 'none',
      background: isActive ? '#2a2a32' : 'transparent',
      cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      padding: '6px 12px',
      borderRadius: '6px',
      lineHeight: 1,
      color: disabled ? '#4a4a52' : isActive ? '#e6e6e6' : '#8a8a92',
      fontWeight: isActive ? 500 : 'normal',
    };
  }

  return (
    <div
      data-testid="toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid #2a2a32',
        background: '#1a1a1f',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            data-testid="toolbar-btn-free"
            data-active={activeTab === 'free' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('free', !switchAllowed)}
            onClick={() => {
              setActiveTab('free');
              void handleSkill('free');
            }}
          >
            Free Terminal
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-new"
            data-active={activeTab === 'new' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('new', !switchAllowed)}
            onClick={() => {
              setActiveTab('new');
              void handleSkill('new');
            }}
          >
            New
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-triage"
            data-active={activeTab === 'triage' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('triage', !switchAllowed)}
            onClick={() => {
              setActiveTab('triage');
              void handleSkill('triage');
            }}
          >
            Triage
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-explore"
            data-active={activeTab === 'explore' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('explore', !switchAllowed)}
            onClick={() => {
              setActiveTab('explore');
              void handleSkill('explore');
            }}
          >
            Explore
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-decide"
            data-active={activeTab === 'decide' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('decide', !switchAllowed)}
            onClick={() => {
              setActiveTab('decide');
              void handleSkill('decide');
            }}
          >
            Decide
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-map"
            data-active={activeTab === 'map' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('map', !switchAllowed)}
            onClick={() => {
              setActiveTab('map');
              void handleSkill('map');
            }}
          >
            Map
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-audit"
            data-active="false"
            disabled={auditWaiting}
            style={tabStyle('audit', auditWaiting, false)}
            onClick={() => void handleAudit()}
          >
            {auditWaiting ? 'Waiting…' : 'Audit'}
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-status"
            data-active={toolbarOverlay === 'status' ? 'true' : 'false'}
            style={tabStyle('status', false, toolbarOverlay === 'status')}
            onClick={() => {
              setActiveTab(null);
              setToolbarOverlay('status');
            }}
          >
            Status
          </button>

          <button
            type="button"
            data-testid="toolbar-btn-finalize"
            data-active={toolbarOverlay === 'finalize' ? 'true' : 'false'}
            disabled={!switchAllowed}
            style={tabStyle('finalize', !switchAllowed, toolbarOverlay === 'finalize')}
            onClick={() => {
              setActiveTab(null);
              setToolbarOverlay('finalize');
            }}
          >
            Finalize
          </button>
        </div>

        {effectiveError && (
          <p
            role="alert"
            data-testid="toolbar-error"
            style={{ margin: '4px 0 0', color: '#f38ba8', fontSize: 12 }}
          >
            {effectiveError}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#6a6a72', fontSize: 12 }}>{projectName ?? ''}</span>
        <span
          data-testid="toolbar-health-dot"
          data-health={claudeStatus}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            display: 'inline-block',
            background: HEALTH_DOT_COLOR[claudeStatus],
          }}
        />
      </div>

      <style>{`
        [data-testid^="toolbar-btn-"]:not(:disabled):not([data-active="true"]):hover {
          background: #1f1f26 !important;
        }
        [data-testid^="toolbar-btn-"]:focus-visible {
          outline: 1px solid #3a3a42;
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
