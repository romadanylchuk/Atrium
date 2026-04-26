import { useAtriumStore, type ConsultationPanelState } from '@renderer/store/atriumStore';

export interface UsePanelStateResult {
  state: ConsultationPanelState;
  isOpen: boolean;
  isPinned: boolean;
  open: () => void;
  close: () => void;
  togglePin: () => void;
}

export function usePanelState(): UsePanelStateResult {
  const state = useAtriumStore((s) => s.consultation.panel);
  const isPinned = useAtriumStore((s) => s.consultation.pinState);
  const open = useAtriumStore((s) => s.openConsultationPanel);
  const close = useAtriumStore((s) => s.closeConsultationPanel);
  const togglePin = useAtriumStore((s) => s.toggleConsultationPin);

  return {
    state,
    isOpen: state.kind !== 'closed',
    isPinned,
    open,
    close,
    togglePin,
  };
}
