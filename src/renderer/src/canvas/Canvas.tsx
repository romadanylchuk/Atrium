import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getRectOfNodes,
  getTransformForBounds,
  MarkerType,
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
import { CanvasControls, FIT_PADDING } from './CanvasControls';
import { NodeSearch } from './NodeSearch';
import { computeHighlight, DIMMED_NODE_STYLE, DIMMED_EDGE_COLOR, FOCUSED_NODE_STYLE } from './legendHighlight';
import type { AtriumEdgeData } from './AtriumEdge';

const nodeTypes = { atriumNode: AtriumNode };
const edgeTypes = { atriumEdge: AtriumEdge };
// Explicit minZoom so the initial fit is never clamped by the (dynamic) instance minZoom.
const FIT_VIEW_OPTIONS = { maxZoom: 1.2, minZoom: 0.02, padding: FIT_PADDING } as const;
// React Flow's default floor; only lowered when the graph needs more room to fit.
const DEFAULT_MIN_ZOOM = 0.5;
const FALLBACK_NODE_SIZE = { width: 96, height: 36 };

/** Zoom level at which every node fits inside a container of the given size. */
function computeFitZoom(nodes: Node[], width: number, height: number): number | null {
  if (nodes.length === 0 || width === 0 || height === 0) return null;
  const sized = nodes.map((n) => ({
    ...n,
    width: n.width ?? FALLBACK_NODE_SIZE.width,
    height: n.height ?? FALLBACK_NODE_SIZE.height,
    positionAbsolute: n.positionAbsolute ?? n.position,
  }));
  const [, , zoom] = getTransformForBounds(getRectOfNodes(sized), width, height, 0.001, 10, FIT_PADDING);
  return zoom;
}

function CanvasInner() {
  const canvas = useAtriumStore((s) => s.canvas);
  const project = useAtriumStore((s) => s.project);
  const clearSelection = useAtriumStore((s) => s.clearSelection);
  const setTooltipTarget = useAtriumStore((s) => s.setTooltipTarget);
  const relayoutRequestId = useAtriumStore((s) => s.relayoutRequestId);
  const legendHighlight = useAtriumStore((s) => s.legendHighlight);

  const [nodes, setNodes, onNodesChange] = useNodesState<AtriumNodeData>([]);
  const [edges, setEdges] = useEdgesState<AtriumEdgeData>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const [seedPositions, setSeedPositions] = useState<Map<string, NodePosition>>(new Map());
  const persistenceRef = useRef<LayoutPersistence | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rf = useReactFlow();

  const getLiveNodes = useCallback(() => rf.getNodes(), [rf]);
  const getViewportCenter = useCallback((): NodePosition => {
    const rect = containerRef.current?.getBoundingClientRect();
    // jsdom returns a rect object with both dims zero; treat as unmeasured.
    if (!rect || (rect.width === 0 && rect.height === 0)) return { x: 0, y: 0 };
    return rf.screenToFlowPosition({ x: rect.width / 2, y: rect.height / 2 });
  }, [rf]);

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
    getLiveNodes,
    getViewportCenter,
  });

  // Track container size so the zoom floor follows window resizes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zoom out is allowed until the whole graph fits on screen (never above the default floor).
  const minZoom = useMemo(() => {
    const fit = computeFitZoom(nodes, containerSize.width, containerSize.height);
    return fit === null ? DEFAULT_MIN_ZOOM : Math.min(DEFAULT_MIN_ZOOM, fit);
  }, [nodes, containerSize]);

  // Auto-fit: keep the whole graph framed until the user takes over the camera (pans, zooms,
  // drags a node or jumps to a node via search). While active, the view refits whenever the
  // canvas resizes (side panels settle after a project loads) or positions are replaced
  // wholesale (saved layout arrives async, manual re-layout). Re-armed by project open/relayout.
  const autoFitRef = useRef(true);
  const stopAutoFit = useCallback(() => {
    autoFitRef.current = false;
  }, []);

  // Position replacements arrive a render before useProjectSync applies them, so remember the
  // nodes array current at request time and fit on the first different one.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const fitAfterRef = useRef<Node[] | null>(null);
  const handledRelayoutRef = useRef(relayoutRequestId);
  useEffect(() => {
    if (relayoutRequestId !== handledRelayoutRef.current) {
      handledRelayoutRef.current = relayoutRequestId;
      autoFitRef.current = true;
      fitAfterRef.current = nodesRef.current;
    }
  }, [relayoutRequestId]);
  useEffect(() => {
    autoFitRef.current = true;
  }, [project?.projectHash]);
  useEffect(() => {
    fitAfterRef.current = nodesRef.current;
  }, [seedPositions]);

  const lastFitSizeRef = useRef(containerSize);
  useEffect(() => {
    if (!autoFitRef.current || nodes.length === 0) return;
    if (containerSize.width === 0 || containerSize.height === 0) return;
    const positionsReplaced = fitAfterRef.current !== null && fitAfterRef.current !== nodes;
    const resized = lastFitSizeRef.current !== containerSize;
    if (!positionsReplaced && !resized) return;
    // Measured sizes live in React Flow's internal nodes, not in our state copies.
    if (!rf.getNodes().every((n) => n.width && n.height)) return;
    // A newer request may land before this frame (saved layout arriving); only clear the
    // request this fit was scheduled for so the newer one still gets its fit.
    const request = fitAfterRef.current;
    const raf = requestAnimationFrame(() => {
      if (fitAfterRef.current === request) fitAfterRef.current = null;
      lastFitSizeRef.current = containerSize;
      rf.fitView(FIT_VIEW_OPTIONS);
    });
    return () => cancelAnimationFrame(raf);
  }, [nodes, containerSize, rf]);

  // Legend highlight: grey out nodes/edges that don't match the picked legend row.
  const highlight = useMemo(
    () =>
      computeHighlight(
        legendHighlight,
        nodes.map((n) => ({ slug: n.id, maturity: n.data.maturity })),
        edges.map((e) => ({ id: e.id, from: e.source, to: e.target, type: e.data?.type ?? '' })),
      ),
    [legendHighlight, nodes, edges],
  );

  const displayNodes = useMemo(() => {
    if (!highlight) return nodes;
    const focusedSlug = legendHighlight?.kind === 'node' ? legendHighlight.value : null;
    return nodes.map((n) => {
      const lit = highlight.litNodes.has(n.id);
      const focused = n.id === focusedSlug;
      return {
        ...n,
        style: {
          ...n.style,
          ...(lit ? {} : DIMMED_NODE_STYLE),
          ...(focused ? FOCUSED_NODE_STYLE : {}),
          transition: 'opacity 150ms, filter 150ms',
        },
        zIndex: focused ? 2 : lit ? 1 : 0,
      };
    });
  }, [nodes, highlight, legendHighlight]);

  const displayEdges = useMemo(() => {
    if (!highlight) return edges;
    return edges.map((e) => {
      const lit = highlight.litEdges.has(e.id);
      if (lit) return { ...e, zIndex: 1 };
      return {
        ...e,
        zIndex: 0,
        data: { type: e.data?.type ?? '', dimmed: true },
        markerEnd: { type: MarkerType.ArrowClosed, color: DIMMED_EDGE_COLOR },
      };
    });
  }, [edges, highlight]);

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
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#0f0f13' }}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        minZoom={minZoom}
        onNodesChange={handleNodesChange}
        onMoveEnd={handleViewportChange}
        // Programmatic moves (fitView, setCenter) have no source event.
        onMoveStart={(event) => {
          if (event) stopAutoFit();
        }}
        onNodeDragStart={stopAutoFit}
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
      <CanvasControls onUserZoom={stopAutoFit} />
      <NodeSearch onNavigate={stopAutoFit} />
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
