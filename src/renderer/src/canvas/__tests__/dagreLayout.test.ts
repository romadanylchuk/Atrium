import { describe, it, expect } from 'vitest';
import { computeDagrePositions, selectLayoutEdges, NODESEP, RANKSEP } from '../dagreLayout';
import type { NodePosition } from '@shared/layout';

function makeNodes(slugs: string[]) {
  return slugs.map((slug) => ({ slug }));
}

describe('dagre constants', () => {
  it('NODESEP is 16', () => {
    expect(NODESEP).toBe(16);
  });

  it('RANKSEP is 60', () => {
    expect(RANKSEP).toBe(60);
  });
});

describe('computeDagrePositions', () => {
  it('(a) empty existing + 3 new → 3 positions returned, all finite numbers', () => {
    const nodes = makeNodes(['a', 'b', 'c']);
    const connections = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const existing = new Map<string, NodePosition>();

    const result = computeDagrePositions(nodes, connections, existing);

    expect(result.size).toBe(3);
    for (const [, pos] of result) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }
  });

  it('(b) 3 existing + 1 new → only the new slug in returned map', () => {
    const nodes = makeNodes(['a', 'b', 'c', 'd']);
    const connections = [{ from: 'a', to: 'b' }];
    const existing = new Map<string, NodePosition>([
      ['a', { x: 10, y: 20 }],
      ['b', { x: 30, y: 40 }],
      ['c', { x: 50, y: 60 }],
    ]);

    const result = computeDagrePositions(nodes, connections, existing);

    expect(result.size).toBe(1);
    expect(result.has('d')).toBe(true);
    expect(result.has('a')).toBe(false);
    expect(result.has('b')).toBe(false);
    expect(result.has('c')).toBe(false);

    const pos = result.get('d')!;
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  it('(c) determinism: same input → same output', () => {
    const nodes = makeNodes(['x', 'y', 'z']);
    const connections = [{ from: 'x', to: 'y' }, { from: 'y', to: 'z' }];
    const existing = new Map<string, NodePosition>();

    const r1 = computeDagrePositions(nodes, connections, existing);
    const r2 = computeDagrePositions(nodes, connections, existing);

    expect(r1.size).toBe(r2.size);
    for (const [slug, pos1] of r1) {
      const pos2 = r2.get(slug)!;
      expect(pos1.x).toBe(pos2.x);
      expect(pos1.y).toBe(pos2.y);
    }
  });
});

describe('selectLayoutEdges', () => {
  const slugs = new Set(['a', 'b', 'c', 'd', 'e']);

  it('drops transitive dependency shortcuts', () => {
    const edges = selectLayoutEdges(slugs, [
      { from: 'a', to: 'b', type: 'dependency' },
      { from: 'b', to: 'c', type: 'dependency' },
      { from: 'a', to: 'c', type: 'dependency' },
    ]);
    expect(edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
  });

  it('ignores non-hierarchical edges between already-placed nodes but keeps them for floating nodes', () => {
    const edges = selectLayoutEdges(slugs, [
      { from: 'a', to: 'b', type: 'dependency' },
      { from: 'a', to: 'b', type: 'shared-concern' },
      { from: 'b', to: 'd', type: 'shared-concern' },
    ]);
    expect(edges).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'd' },
    ]);
  });

  it('places a node between its parent and child ranks', () => {
    const pos = computeDagrePositions(
      makeNodes(['a', 'b', 'c']),
      [
        { from: 'a', to: 'c', type: 'dependency' },
        { from: 'a', to: 'b', type: 'dependency' },
        { from: 'b', to: 'c', type: 'dependency' },
      ],
      new Map(),
    );
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x);
    expect(pos.get('b')!.x).toBeLessThan(pos.get('c')!.x);
  });

  it('survives dependency cycles', () => {
    const edges = selectLayoutEdges(slugs, [
      { from: 'a', to: 'b', type: 'dependency' },
      { from: 'b', to: 'a', type: 'dependency' },
    ]);
    expect(edges.length).toBe(2);
  });
});
