import { useEffect, useRef } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';

export function useConsultationTerminal(projectRoot: string | null): void {
  const id = useAtriumStore((s) => s.consultationTerminal.id);
  const status = useAtriumStore((s) => s.consultationTerminal.status);
  const panelKind = useAtriumStore((s) => s.consultation.panel.kind);
  const setSpawning = useAtriumStore((s) => s.setConsultationTerminalSpawning);
  const setActive = useAtriumStore((s) => s.setConsultationTerminalActive);
  const setExited = useAtriumStore((s) => s.setConsultationTerminalExited);
  const clearConsultationTerminal = useAtriumStore((s) => s.clearConsultationTerminal);

  // Ref so the guard reads the latest status without status being a dep.
  // This prevents setSpawning() from immediately re-triggering the effect
  // (which would cancel the in-flight IPC promise via the cancelled flag).
  const statusRef = useRef(status);
  statusRef.current = status;

  const isOpen = panelKind !== 'closed';

  useEffect(() => {
    if (!isOpen || !projectRoot || statusRef.current !== 'idle') return;

    let cancelled = false;
    setSpawning();
    void window.atrium.consultation.spawnTerminal({ cwd: projectRoot }).then((result) => {
      if (cancelled) return;
      if (result.ok) setActive(result.data);
      else setExited();
    });
    return () => {
      cancelled = true;
      // If panel closed while spawn was in-flight, reset stuck 'spawning' state.
      // Guard on 'spawning' to avoid killing an already-active terminal on panel close.
      if (statusRef.current === 'spawning') {
        clearConsultationTerminal();
      }
    };
  // id in deps (not status) so the effect re-triggers after clearConsultationTerminal() resets
  // id to null (Restart flow) without re-triggering on setSpawning() which only changes status.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectRoot, id, setSpawning, setActive, setExited, clearConsultationTerminal]);
}
