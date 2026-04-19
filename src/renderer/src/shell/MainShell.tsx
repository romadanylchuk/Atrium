import type { JSX } from 'react';
import { Canvas } from '@renderer/canvas/Canvas';
import { Tooltip } from '../interaction/Tooltip';
import { SidePanel } from '../sidePanel/SidePanel';
import { Toolbar } from '../toolbar/Toolbar';
import { TerminalModal } from '../terminal/TerminalModal';

export function MainShell(): JSX.Element {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh' }}
      data-testid="main-shell"
    >
      <div data-region="toolbar" style={{ flexShrink: 0 }}>
        <Toolbar />
      </div>
      <div style={{ display: 'flex', flex: '1 1 auto', overflow: 'hidden', position: 'relative' }}>
        <div style={{ flex: '1 1 auto', overflow: 'hidden' }}>
          <Canvas />
        </div>
        <aside
          data-region="side-panel"
          style={{ flex: '0 0 280px', overflow: 'auto' }}
        >
          <SidePanel />
        </aside>
        <Tooltip />
      </div>
      <TerminalModal />
    </div>
  );
}
