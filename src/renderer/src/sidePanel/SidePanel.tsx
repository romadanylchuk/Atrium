import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { ProjectPanel } from './ProjectPanel';
import { SelectionPanel } from './SelectionPanel';

export function SidePanel(): JSX.Element {
  const activePanel = useAtriumStore((s) => s.activePanel);

  return (
    <div data-testid="side-panel" style={{ width: '100%', height: '100%' }}>
      {activePanel === 'project' ? <ProjectPanel /> : <SelectionPanel />}
    </div>
  );
}
