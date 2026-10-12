import { useEffect, useRef } from 'react';
import { MarkerType, type Node as RFNode, type Edge as RFEdge } from 'reactflow';
import type { NodePosition } from '@shared/layout';
import type { ProjectState } from '@shared/domain';
import { useAtriumStore } from '../store/atriumStore';
import { computeDagrePositions } from './dagreLayout';
import { resolveMaturityStyle, resolveConnectionStyle } from './visualEncoding';

export interface UseProjectSyncParams {
  project: ProjectState | null;
  seedPositions?: Map<string, NodePosition>;
  setNodes: (nodes: RFNode[]) => void;
  setEdges: (edges: RFEdge[]) => void;
  relayoutRequestId?: number;
  /** Returns React Flow's current live node array (positions reflect user drags). */
  getLiveNodes: () => RFNode[];
  /** Returns the viewport center expressed in flow coordinates. Returns `{x:0,y:0}` if the container has no measurable rect. */
  getViewportCenter: () => NodePosition;
}

export function useProjectSync(params: UseProjectSyncParams): void {
  const {
    project,
    seedPositions,
    setNodes,
    setEdges,
    relayoutRequestId = 0,
    getLiveNodes,
    getViewportCenter,
  } = params;

  // Track previous RF node list to diff against
  const prevNodesRef = useRef<RFNode[]>([]);
  // Track last seen relayoutRequestId to detect manual re-layout triggers
  const prevRelayoutIdRef = useRef<number>(0);
  // Warning tracker: reset on projectHash change
  const warnTrackerRef = useRef<{
    hash: string;
    maturity: Set<string>;
    connType: Set<string>;
    staleLayoutSlugs: Set<string>;
    seedApplied: boolean;
  }>({
    hash: '',
    maturity: new Set(),
    connType: new Set(),
    staleLayoutSlugs: new Set(),
    seedApplied: false,
  });

  useEffect(() => {
    if (project === null) {
      prevNodesRef.current = [];
      setNodes([]);
      setEdges([]);
      return;
    }

    const tracker = warnTrackerRef.current;
    // Reset warning tracker on new project (identified by projectHash)
    if (tracker.hash !== project.projectHash) {
      tracker.hash = project.projectHash;
      tracker.maturity = new Set();
      tracker.connType = new Set();
      tracker.staleLayoutSlugs = new Set();
      tracker.seedApplied = false;
      prevNodesRef.current = [];
    }

    const prevNodes = prevNodesRef.current;
    const prevSlugs = new Set(prevNodes.map((n) => n.id));
    const nextSlugs = new Set(project.nodes.map((n) => n.slug));

    // Manual re-layout: treat all nodes as new so dagre runs for everything
    const isRelayoutTrigger = relayoutRequestId > prevRelayoutIdRef.current;
    if (isRelayoutTrigger) {
      prevRelayoutIdRef.current = relayoutRequestId;
    }

    const addedSlugs = isRelayoutTrigger
      ? new Set(nextSlugs)
      : new Set([...nextSlugs].filter((s) => !prevSlugs.has(s)));
    const removedSlugs = new Set([...prevSlugs].filter((s) => !nextSlugs.has(s)));

    // Handle removed nodes — strip from selection + tooltip
    if (removedSlugs.size > 0) {
      const storeState = useAtriumStore.getState();
      for (const slug of removedSlugs) {
        storeState.deselectNode(slug);
      }
      const tooltipTarget = storeState.tooltipTarget;
      if (tooltipTarget !== null && removedSlugs.has(tooltipTarget)) {
        useAtriumStore.setState({ tooltipTarget: null });
      }
    }

    // Build existing position map from React Flow's live store (source of truth for
    // user-dragged positions). Cleared on manual relayout so dagre re-runs cleanly.
    const existingPositions = new Map<string, NodePosition>();
    if (!isRelayoutTrigger) {
      const liveNodes = getLiveNodes();
      const liveById = new Map(liveNodes.map((n) => [n.id, n] as const));
      for (const slug of nextSlugs) {
        const live = liveById.get(slug);
        if (live) {
          existingPositions.set(slug, { x: live.position.x, y: live.position.y });
        }
      }
    }

    // All-identical-seed gate: if multiple seeds all share the same coordinate,
    // treat as an auto-layout marker and skip seed application so dagre runs fresh.
    const allIdenticalSeeds =
      !!seedPositions &&
      seedPositions.size > 1 &&
      new Set(Array.from(seedPositions.values()).map((p) => `${p.x}_${p.y}`)).size === 1;

    // Compute first-sync status BEFORE the seed-application block flips `seedApplied`,
    // so the dagre predicate sees the pre-application state.
    const isFirstSync = prevNodes.length === 0 && !tracker.seedApplied;

    // First pass for this projectHash: seeds overwrite existing (which may be dagre from an
    // empty-seed first render). Only flip seedApplied when seeds are non-empty so the two-render
    // flow (Canvas mounts sync, layout.load resolves async) still wins on the populated pass.
    if (seedPositions && !tracker.seedApplied && !allIdenticalSeeds) {
      for (const [slug, pos] of seedPositions) {
        if (!nextSlugs.has(slug)) {
          if (!tracker.staleLayoutSlugs.has(slug)) {
            tracker.staleLayoutSlugs.add(slug);
            console.warn(`[atrium] Stale layout slug dropped: "${slug}"`);
          }
          continue;
        }
        existingPositions.set(slug, pos);
      }
      if (seedPositions.size > 0) {
        tracker.seedApplied = true;
      }
    } else if (allIdenticalSeeds && !tracker.seedApplied) {
      // Skip seed application but mark as applied so dagre runs via addedSlugs path
      tracker.seedApplied = true;
    }

    // Dagre runs for added slugs only on first project open with no usable seeds,
    // or on an explicit re-layout request. All other in-session adds go to viewport center.
    const useDagreForAdded =
      isRelayoutTrigger ||
      (isFirstSync && (!seedPositions || seedPositions.size === 0 || allIdenticalSeeds));

    // Compute positions for newly added slugs
    const addedPositions = new Map<string, NodePosition>();
    if (addedSlugs.size > 0) {
      if (useDagreForAdded) {
        const dagre = computeDagrePositions(
          project.nodes.map((n) => ({ slug: n.slug })),
          project.connections.map((c) => ({ from: c.from, to: c.to, type: c.type })),
          existingPositions,
        );
        for (const [slug, pos] of dagre) {
          addedPositions.set(slug, pos);
        }
      } else {
        const center = getViewportCenter();
        for (const slug of addedSlugs) {
          if (!existingPositions.has(slug)) {
            addedPositions.set(slug, { x: center.x, y: center.y });
          }
        }
      }
    }

    // Build new RF nodes
    const nextRFNodes: RFNode[] = project.nodes.map((node) => {
      // Warn on unknown maturity (once per distinct value per project-open)
      const { known: maturityKnown } = resolveMaturityStyle(node.maturity);
      if (!maturityKnown && !tracker.maturity.has(node.maturity)) {
        tracker.maturity.add(node.maturity);
        console.warn(`[atrium] Unknown node maturity: "${node.maturity}"`);
      }

      // Position: existing (from RF live store / seeds) > newly-assigned > origin fallback
      const pos =
        existingPositions.get(node.slug) ??
        addedPositions.get(node.slug) ??
        { x: 0, y: 0 };

      return {
        id: node.slug,
        type: 'atriumNode',
        position: pos,
        data: {
          slug: node.slug,
          name: node.name,
          maturity: node.maturity,
        },
      };
    });

    // Build new RF edges
    const nextRFEdges: RFEdge[] = project.connections.map((conn, idx) => {
      const edgeId = `${conn.from}-${conn.to}-${idx}`;
      const { known: connKnown, style: connStyle } = resolveConnectionStyle(conn.type);
      if (!connKnown && !tracker.connType.has(conn.type)) {
        tracker.connType.add(conn.type);
        if (import.meta.env.DEV) {
          console.warn(
            `[atrium] Unknown connection type: "${conn.type}" on edge ${edgeId}. Falling back to unknown style.`,
          );
        }
      }

      return {
        id: edgeId,
        source: conn.from,
        target: conn.to,
        type: 'atriumEdge',
        data: { type: conn.type },
        markerEnd: { type: MarkerType.ArrowClosed, color: connStyle.color },
      };
    });

    prevNodesRef.current = nextRFNodes;
    setNodes(nextRFNodes);
    setEdges(nextRFEdges);
  }, [project, seedPositions, setNodes, setEdges, relayoutRequestId, getLiveNodes, getViewportCenter]);
}
