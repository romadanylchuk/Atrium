import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { useToastStore } from '@renderer/store/toastStore';
import { canSwitch } from '@renderer/sidePanel/canSwitchSelector';
import { dispatchSkill } from '@renderer/skill/dispatchSkill';
import { TerminalModal } from '@renderer/terminal/TerminalModal';
import { StatusPanel } from '@renderer/toolbar/StatusPanel';
import { FinalizePanel } from '@renderer/toolbar/FinalizePanel';
import { DetachedResultPopup } from '@renderer/toolbar/DetachedResultPopup';

export function CanvasRegionHost(): JSX.Element {
  const terminalStatus = useAtriumStore((s) => s.terminal.status);
  const toolbarOverlay = useAtriumStore((s) => s.toolbarOverlay);
  const setToolbarOverlay = useAtriumStore((s) => s.setToolbarOverlay);
  const project = useAtriumStore((s) => s.project);
  const pushToast = useToastStore((s) => s.pushToast);
  const detachedRuns = useAtriumStore((s) => s.detachedRuns);
  const closeDetachedResult = useAtriumStore((s) => s.closeDetachedResult);

  const terminalVisible =
    terminalStatus === 'spawning' || terminalStatus === 'active' || terminalStatus === 'exited';
  const switchAllowed = canSwitch(terminalStatus);

  async function handleFinalizeContinue(): Promise<void> {
    if (!project) return;
    setToolbarOverlay(null);
    const selectedNodes = useAtriumStore.getState().selectedNodes;
    const r = await dispatchSkill({
      skill: 'finalize',
      nodes: Array.from(selectedNodes),
      cwd: project.rootPath,
    });
    if (!r.ok) {
      pushToast(r.error.message, 'error');
    }
  }

  return (
    <>
      {terminalVisible && <TerminalModal />}
      {toolbarOverlay === 'status' && project && (
        <StatusPanel project={project} onClose={() => setToolbarOverlay(null)} />
      )}
      {toolbarOverlay === 'finalize' && project && (
        <FinalizePanel
          project={project}
          canContinue={switchAllowed}
          onContinue={() => void handleFinalizeContinue()}
          onClose={() => setToolbarOverlay(null)}
        />
      )}
      {detachedRuns.audit.kind === 'done' && (
        <DetachedResultPopup
          title="Audit"
          output={detachedRuns.audit.output}
          onClose={() => closeDetachedResult('audit')}
          testid="audit-result-popup"
          zIndex={101}
        />
      )}
      {detachedRuns.status.kind === 'done' && (
        <DetachedResultPopup
          title="Status"
          output={detachedRuns.status.output}
          onClose={() => closeDetachedResult('status')}
          testid="status-result-popup"
        />
      )}
    </>
  );
}
