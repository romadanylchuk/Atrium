import { useEffect, useRef } from 'react';
import type { Node as RFNode, Edge as RFEdge } from 'reactflow';
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
}

export function useProjectSync(params: UseProjectSyncParams): void {
  const { project, seedPositions, setNodes, setEdges } = params;

  // Track previous RF node list to diff against
  const prevNodesRef = useRef<RFNode[]>([]);
  // Warning tracker: reset on projectHash change
  const warnTrackerRef = useRef<{ hash: string; maturity: Set<string>; connType: Set<string> }>({
    hash: '',
    maturity: new Set(),
    connType: new Set(),
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
    }

    const prevNodes = prevNodesRef.current;
    const prevSlugs = new Set(prevNodes.map((n) => n.id));
    const nextSlugs = new Set(project.nodes.map((n) => n.slug));

    const addedSlugs = new Set([...nextSlugs].filter((s) => !prevSlugs.has(s)));
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

    // Build existing position map from current RF nodes
    const existingPositions = new Map<string, NodePosition>();
    for (const rfNode of prevNodes) {
      if (!removedSlugs.has(rfNode.id)) {
        existingPositions.set(rfNode.id, { x: rfNode.position.x, y: rfNode.position.y });
      }
    }

    // Seed positions from layout:load (first project-open)
    if (seedPositions) {
      for (const [slug, pos] of seedPositions) {
        if (!existingPositions.has(slug)) {
          existingPositions.set(slug, pos);
        }
      }
    }

    // Compute dagre positions for new nodes
    let dagrePositions = new Map<string, NodePosition>();
    if (addedSlugs.size > 0) {
      dagrePositions = computeDagrePositions(
        project.nodes.map((n) => ({ slug: n.slug })),
        project.connections.map((c) => ({ from: c.from, to: c.to })),
        existingPositions,
      );
    }

    // Build new RF nodes
    const nextRFNodes: RFNode[] = project.nodes.map((node) => {
      // Warn on unknown maturity (once per distinct value per project-open)
      const { known: maturityKnown } = resolveMaturityStyle(node.maturity);
      if (!maturityKnown && !tracker.maturity.has(node.maturity)) {
        tracker.maturity.add(node.maturity);
        console.warn(`[atrium] Unknown node maturity: "${node.maturity}"`);
      }

      // Position: existing (from RF state) > dagre-assigned > origin fallback
      const pos =
        existingPositions.get(node.slug) ??
        dagrePositions.get(node.slug) ??
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
      const { known: connKnown } = resolveConnectionStyle(conn.type);
      if (!connKnown && !tracker.connType.has(conn.type)) {
        tracker.connType.add(conn.type);
        console.warn(`[atrium] Unknown connection type: "${conn.type}"`);
      }

      return {
        id: `${conn.from}-${conn.to}-${idx}`,
        source: conn.from,
        target: conn.to,
        type: 'atriumEdge',
        data: { type: conn.type },
      };
    });

    prevNodesRef.current = nextRFNodes;
    setNodes(nextRFNodes);
    setEdges(nextRFEdges);
  }, [project, seedPositions, setNodes, setEdges]);
}
