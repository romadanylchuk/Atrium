import dagre from 'dagre';
import type { NodePosition } from '@shared/layout';

export const DAGRE_RANKDIR = 'TB' as const;
export const NODESEP = 40;
export const RANKSEP = 80;

const DEFAULT_NODE_WIDTH = 96;
const DEFAULT_NODE_HEIGHT = 36;

/** Connection types that express a direction (parent → child) and therefore drive ranking. */
const HIERARCHICAL_TYPES = new Set(['dependency']);

type LayoutConnection = { from: string; to: string; type?: string };

/**
 * Picks the edges dagre should rank by:
 * - hierarchical edges with transitive shortcuts removed (a→c is dropped when a→b→c
 *   exists), so every node lands on the rank between its direct parents and children
 *   instead of being stretched by long skip-edges;
 * - non-hierarchical edges only for nodes that would otherwise float unconnected.
 * Connections without a `type` are treated as hierarchical.
 */
export function selectLayoutEdges(
  slugs: Set<string>,
  connections: LayoutConnection[],
): Array<{ from: string; to: string }> {
  const key = (from: string, to: string) => `${from}\u0000${to}`;
  const hier = new Map<string, { from: string; to: string }>();
  const other: Array<{ from: string; to: string }> = [];

  for (const c of connections) {
    if (c.from === c.to || !slugs.has(c.from) || !slugs.has(c.to)) continue;
    if (c.type === undefined || HIERARCHICAL_TYPES.has(c.type)) {
      hier.set(key(c.from, c.to), { from: c.from, to: c.to });
    } else {
      other.push({ from: c.from, to: c.to });
    }
  }

  const children = new Map<string, string[]>();
  for (const e of hier.values()) {
    const list = children.get(e.from) ?? [];
    list.push(e.to);
    children.set(e.from, list);
  }

  // Is `target` reachable from `start` without using the direct start→target edge?
  function reachableIndirectly(start: string, target: string): boolean {
    const stack = (children.get(start) ?? []).filter((c) => c !== target);
    const seen = new Set<string>(stack);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      for (const next of children.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  }

  const result = [...hier.values()].filter((e) => !reachableIndirectly(e.from, e.to));

  const connected = new Set<string>();
  for (const e of result) {
    connected.add(e.from);
    connected.add(e.to);
  }
  for (const e of other) {
    if (connected.has(e.from) && connected.has(e.to)) continue;
    if (hier.has(key(e.from, e.to)) || hier.has(key(e.to, e.from))) continue;
    result.push(e);
    connected.add(e.from);
    connected.add(e.to);
  }
  return result;
}

export function computeDagrePositions(
  nodes: Array<{ slug: string; width?: number; height?: number }>,
  connections: LayoutConnection[],
  existingPositions: Map<string, NodePosition>,
): Map<string, NodePosition> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: DAGRE_RANKDIR, nodesep: NODESEP, ranksep: RANKSEP, edgesep: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.slug, {
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
    });
  }
  const slugs = new Set(nodes.map((n) => n.slug));
  for (const edge of selectLayoutEdges(slugs, connections)) {
    g.setEdge(edge.from, edge.to);
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

  // dagre reports node centers; React Flow positions are top-left corners.
  const result = new Map<string, NodePosition>();
  for (const node of nodes) {
    if (existingPositions.has(node.slug)) continue;
    const pos = g.node(node.slug);
    if (pos) {
      result.set(node.slug, { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 });
    }
  }
  return result;
}
