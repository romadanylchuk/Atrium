import type { JSX } from 'react';
import { usePanelState } from './hooks/usePanelState';
import { EdgeTab } from './EdgeTab';
import { ConsultationPanel } from './ConsultationPanel';

export function ConsultationRegion(): JSX.Element {
  const { state } = usePanelState();
  return state.kind === 'closed' ? <EdgeTab /> : <ConsultationPanel />;
}
