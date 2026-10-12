import type { LegendHighlight } from '../store/atriumStore';

/**
 * Decides which nodes/edges stay lit for a legend highlight.
 * - maturity: nodes with that maturity; edges whose both ends have it.
 * - connection: edges of that type; nodes touching at least one of them.
 * Returns null when nothing is highlighted (everything rendered normally).
 */
export function computeHighlight(
  highlight: LegendHighlight | null,
  nodes: Array<{ slug: string; maturity: string }>,
  connections: Array<{ id: string; from: string; to: string; type: string }>,
): { litNodes: Set<string>; litEdges: Set<string> } | null {
  if (highlight === null) return null;

  const litNodes = new Set<string>();
  const litEdges = new Set<string>();

  if (highlight.kind === 'maturity') {
    for (const n of nodes) {
      if (n.maturity === highlight.value) litNodes.add(n.slug);
    }
    for (const c of connections) {
      if (litNodes.has(c.from) && litNodes.has(c.to)) litEdges.add(c.id);
    }
  } else {
    for (const c of connections) {
      if (c.type !== highlight.value) continue;
      litEdges.add(c.id);
      litNodes.add(c.from);
      litNodes.add(c.to);
    }
  }
  return { litNodes, litEdges };
}

export const DIMMED_NODE_STYLE = { opacity: 0.2, filter: 'grayscale(1)' } as const;
export const DIMMED_EDGE_COLOR = '#3a3a42';
