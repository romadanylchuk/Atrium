import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { usePanelState } from './hooks/usePanelState';
import { EdgeTab } from './EdgeTab';
import { ConsultationPanel } from './ConsultationPanel';

export function ConsultationRegion(): JSX.Element | null {
  const project = useAtriumStore((s) => s.project);
  const { state } = usePanelState();
  if (project === null) return null;
  return state.kind === 'closed' ? <EdgeTab /> : <ConsultationPanel />;
}
