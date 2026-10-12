import { describe, it, expect } from 'vitest';
import { computeHighlight } from '../legendHighlight';

const nodes = [
  { slug: 'a', maturity: 'ready' },
  { slug: 'b', maturity: 'ready' },
  { slug: 'c', maturity: 'explored' },
];
const connections = [
  { id: 'e1', from: 'a', to: 'b', type: 'dependency' },
  { id: 'e2', from: 'b', to: 'c', type: 'shared-concern' },
];

describe('computeHighlight', () => {
  it('returns null with no highlight', () => {
    expect(computeHighlight(null, nodes, connections)).toBeNull();
  });

  it('maturity: lights matching nodes and edges fully inside them', () => {
    const r = computeHighlight({ kind: 'maturity', value: 'ready' }, nodes, connections)!;
    expect([...r.litNodes].sort()).toEqual(['a', 'b']);
    expect([...r.litEdges]).toEqual(['e1']);
  });

  it('connection: lights matching edges and their endpoints', () => {
    const r = computeHighlight({ kind: 'connection', value: 'shared-concern' }, nodes, connections)!;
    expect([...r.litEdges]).toEqual(['e2']);
    expect([...r.litNodes].sort()).toEqual(['b', 'c']);
  });
});

describe('computeHighlight — node', () => {
  it('lights the node, its connections and direct neighbours only', () => {
    const r = computeHighlight({ kind: 'node', value: 'a' }, nodes, connections)!;
    expect([...r.litNodes].sort()).toEqual(['a', 'b']);
    expect([...r.litEdges]).toEqual(['e1']);
  });
});
