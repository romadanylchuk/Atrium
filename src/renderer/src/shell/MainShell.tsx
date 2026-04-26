import type { JSX } from 'react';
import { Canvas } from '@renderer/canvas/Canvas';
import { CanvasRegionHost } from '@renderer/canvas/CanvasRegionHost';
import { Tooltip } from '../interaction/Tooltip';
import { SidePanel } from '../sidePanel/SidePanel';
import { Toolbar } from '../toolbar/Toolbar';
import { ConsultationRegion } from '../consultation/ConsultationRegion';

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
        <div
          data-region="canvas"
          style={{ flex: '1 1 auto', minWidth: 0, position: 'relative', overflow: 'hidden' }}
        >
          <Canvas />
          <CanvasRegionHost />
        </div>
        <aside
          data-region="side-panel"
          style={{ flex: '0 0 240px' }}
        >
          <SidePanel />
        </aside>
        <ConsultationRegion />
        <Tooltip />
      </div>
    </div>
  );
}
