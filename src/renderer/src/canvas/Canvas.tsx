import { useEffect, useRef, useState, useCallback } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type Viewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodePosition } from '@shared/layout';
import { useAtriumStore } from '../store/atriumStore';
import { useProjectSync } from './useProjectSync';
import { createLayoutPersistence, type LayoutPersistence } from './layoutPersistence';
import { AtriumNode, type AtriumNodeData } from './AtriumNode';
import { AtriumEdge } from './AtriumEdge';
import { CanvasEmptyState } from './CanvasEmptyState';
import { CanvasErrorState } from './CanvasErrorState';
import { Legend } from './Legend';
import { CanvasControls } from './CanvasControls';

const nodeTypes = { atriumNode: AtriumNode };
const edgeTypes = { atriumEdge: AtriumEdge };
const FIT_VIEW_OPTIONS = { maxZoom: 1.2 } as const;

function CanvasInner() {
  const canvas = useAtriumStore((s) => s.canvas);
  const project = useAtriumStore((s) => s.project);
  const clearSelection = useAtriumStore((s) => s.clearSelection);
  const setTooltipTarget = useAtriumStore((s) => s.setTooltipTarget);
  const relayoutRequestId = useAtriumStore((s) => s.relayoutRequestId);

  const [nodes, setNodes, onNodesChange] = useNodesState<AtriumNodeData>([]);
  const [edges, setEdges] = useEdgesState<Edge[]>([]);

  const [seedPositions, setSeedPositions] = useState<Map<string, NodePosition>>(new Map());
  const persistenceRef = useRef<LayoutPersistence | null>(null);

  // Load persisted layout, create persistence instance, and dispose on projectHash change.
  // Merged into a single effect so StrictMode double-invoke disposes correctly.
  useEffect(() => {
    if (!project) return;

    const hash = project.projectHash;
    const rootPath = project.rootPath;

    const persistence = createLayoutPersistence(hash, rootPath);
    persistenceRef.current = persistence;

    let cancelled = false;
    void window.atrium.layout.load(hash).then((r) => {
      if (cancelled) return;
      const positions =
        r.ok && r.data ? new Map(Object.entries(r.data.nodePositions)) : new Map<string, NodePosition>();
      setSeedPositions(positions);
    });

    return () => {
      cancelled = true;
      persistence.dispose();
    };
  }, [project?.projectHash, project?.rootPath]);

  // beforeunload flush
  useEffect(() => {
    function handleBeforeUnload() {
      persistenceRef.current?.flush();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useProjectSync({
    project,
    seedPositions,
    setNodes: setNodes as (nodes: Node[]) => void,
    setEdges: setEdges as (edges: Edge[]) => void,
    relayoutRequestId,
  });

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      setTimeout(() => {
        if (persistenceRef.current) {
          persistenceRef.current.saveNodes(
            nodes.map((n) => ({ id: n.id, position: n.position })),
          );
        }
      }, 0);
    },
    [onNodesChange, nodes],
  );

  const handleViewportChange = useCallback((_event: unknown, vp: Viewport) => {
    persistenceRef.current?.saveViewport(vp);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0f0f13' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onMoveEnd={handleViewportChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        onPaneClick={() => {
          clearSelection();
          setTooltipTarget(null);
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          clearSelection();
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f1f26" />
      </ReactFlow>
      <CanvasControls />
      <Legend />
      {canvas.kind === 'empty' && <CanvasEmptyState />}
      {canvas.kind === 'error' && <CanvasErrorState message={canvas.message} />}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
