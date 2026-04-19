import debounce from 'lodash.debounce';
import type { LayoutFileV1, NodePosition, Viewport } from '@shared/layout';

export const LAYOUT_SAVE_DEBOUNCE_NODES_MS = 500;
export const LAYOUT_SAVE_DEBOUNCE_VIEWPORT_MS = 1000;

export interface LayoutPersistence {
  saveNodes(nodes: Array<{ id: string; position: NodePosition }>): void;
  saveViewport(vp: Viewport): void;
  flush(): void;
  dispose(): void;
}

export function createLayoutPersistence(projectHash: string, projectPath: string): LayoutPersistence {
  const snapshot: { nodePositions: Record<string, NodePosition>; viewport?: Viewport; projectPath: string; schemaVersion: 1 } = {
    nodePositions: {},
    projectPath,
    schemaVersion: 1,
  };

  function emit(): void {
    const data: LayoutFileV1 = {
      schemaVersion: 1,
      projectPath: snapshot.projectPath,
      nodePositions: snapshot.nodePositions,
      viewport: snapshot.viewport,
    };
    void window.atrium.layout.save(projectHash, data);
    window.atrium.layout.saveSnapshot(projectHash, data);
  }

  const debouncedNodes = debounce(emit, LAYOUT_SAVE_DEBOUNCE_NODES_MS);
  const debouncedViewport = debounce(emit, LAYOUT_SAVE_DEBOUNCE_VIEWPORT_MS);

  return {
    saveNodes(nodes) {
      const positions: Record<string, NodePosition> = {};
      for (const n of nodes) {
        positions[n.id] = n.position;
      }
      snapshot.nodePositions = positions;
      debouncedNodes();
    },

    saveViewport(vp) {
      snapshot.viewport = vp;
      debouncedViewport();
    },

    flush() {
      debouncedNodes.flush();
      debouncedViewport.flush();
    },

    dispose() {
      debouncedNodes.cancel();
      debouncedViewport.cancel();
    },
  };
}
