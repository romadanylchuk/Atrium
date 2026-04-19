import dagre from 'dagre';
import type { NodePosition } from '@shared/layout';

export const DAGRE_RANKDIR = 'TB' as const;
export const NODESEP = 60;
export const RANKSEP = 120;

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 50;

export function computeDagrePositions(
  nodes: Array<{ slug: string; width?: number; height?: number }>,
  connections: Array<{ from: string; to: string }>,
  existingPositions: Map<string, NodePosition>,
): Map<string, NodePosition> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: DAGRE_RANKDIR, nodesep: NODESEP, ranksep: RANKSEP });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.slug, {
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
    });
  }
  for (const conn of connections) {
    if (g.hasNode(conn.from) && g.hasNode(conn.to)) {
      g.setEdge(conn.from, conn.to);
    }
  }

  // dagre's networkSimplex ranker crashes on graphs with no edges.
  // Fall back to a simple grid layout in that case.
  if (g.edgeCount() === 0) {
    const result = new Map<string, NodePosition>();
    let col = 0;
    for (const node of nodes) {
      if (!existingPositions.has(node.slug)) {
        result.set(node.slug, { x: col * (DEFAULT_NODE_WIDTH + NODESEP), y: 0 });
        col++;
      }
    }
    return result;
  }

  dagre.layout(g);

  const result = new Map<string, NodePosition>();
  for (const node of nodes) {
    if (existingPositions.has(node.slug)) continue;
    const pos = g.node(node.slug);
    if (pos) {
      result.set(node.slug, { x: pos.x, y: pos.y });
    }
  }
  return result;
}
