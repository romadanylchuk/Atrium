import { describe, it, expect } from 'vitest';
import { computeDagrePositions } from '../dagreLayout';
import type { NodePosition } from '@shared/layout';

function makeNodes(slugs: string[]) {
  return slugs.map((slug) => ({ slug }));
}

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
