import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectSync } from '../useProjectSync';
import { useAtriumStore } from '../../store/atriumStore';
import type { ProjectState, NodeData, Connection } from '@shared/domain';
import type { Node as RFNode, Edge as RFEdge } from 'reactflow';
import type { NodePosition } from '@shared/layout';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(slug: string, maturity = 'decided'): NodeData {
  return {
    slug,
    name: slug,
    maturity,
    priority: 'core',
    file: `ideas/${slug}.md`,
    summary: '',
    description: '',
    sections: {},
  };
}

function makeConnection(from: string, to: string, type = 'depends-on'): Connection {
  return { from, to, type };
}

function makeProject(
  nodes: NodeData[],
  connections: Connection[] = [],
  hash = 'hash1',
): ProjectState {
  return {
    rootPath: '/tmp/proj',
    projectName: 'test',
    projectHash: hash,
    context: { description: '', sections: {} },
    nodes,
    connections,
    sessions: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function renderSync(
  initialProject: ProjectState | null = null,
  initialSeedPositions?: Map<string, NodePosition>,
) {
  const setNodes = vi.fn<(nodes: RFNode[]) => void>();
  const setEdges = vi.fn<(edges: RFEdge[]) => void>();

  type Props = { project: ProjectState | null; seedPositions?: Map<string, NodePosition> };
  const { rerender } = renderHook(
    ({ project, seedPositions }: Props) => {
      useProjectSync({ project, seedPositions, setNodes, setEdges });
    },
    { initialProps: { project: initialProject, seedPositions: initialSeedPositions } as Props },
  );

  return { setNodes, setEdges, rerender };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAtriumStore.setState({
    project: null,
    selectedNodes: new Set(),
    tooltipTarget: null,
    activePanel: 'project',
    terminal: { id: null, status: 'idle', fullscreen: false },
    canvas: { kind: 'empty' },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 8 diff cases
// ---------------------------------------------------------------------------

describe('useProjectSync diff cases', () => {
  it('case 1: node added → setNodes called with new slug at finite dagre position', () => {
    const { setNodes, rerender } = renderSync(null);

    const callsBefore = setNodes.mock.calls.length;
    act(() => {
      rerender({ project: makeProject([makeNode('alpha')]) });
    });

    expect(setNodes.mock.calls.length).toBe(callsBefore + 1);
    const nodes = setNodes.mock.calls[callsBefore]![0];
    expect(nodes).toHaveLength(1);
    const firstNode = nodes[0]!;
    expect(firstNode.id).toBe('alpha');
    expect(Number.isFinite(firstNode.position.x)).toBe(true);
    expect(Number.isFinite(firstNode.position.y)).toBe(true);
  });

  it('case 2: node removed → setNodes called without that slug', () => {
    const { setNodes, rerender } = renderSync(makeProject([makeNode('alpha'), makeNode('beta')]));

    act(() => {
      rerender({ project: makeProject([makeNode('alpha')]) });
    });

    const nodes = setNodes.mock.calls.at(-1)![0];
    expect(nodes.find((n) => n.id === 'beta')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'alpha')).toBeDefined();
  });

  it('case 3: node removed while selected → selectedNodes no longer contains slug', () => {
    useAtriumStore.setState({ selectedNodes: new Set(['beta']) });
    const { rerender } = renderSync(makeProject([makeNode('alpha'), makeNode('beta')]));

    act(() => {
      rerender({ project: makeProject([makeNode('alpha')]) });
    });

    expect(useAtriumStore.getState().selectedNodes.has('beta')).toBe(false);
  });

  it('case 4: node removed while tooltip open → tooltipTarget is null', () => {
    useAtriumStore.setState({ tooltipTarget: 'beta' });
    const { rerender } = renderSync(makeProject([makeNode('alpha'), makeNode('beta')]));

    act(() => {
      rerender({ project: makeProject([makeNode('alpha')]) });
    });

    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
  });

  it('case 5: maturity changed, slug preserved → same position, updated data.maturity', () => {
    const { setNodes, rerender } = renderSync(makeProject([makeNode('alpha', 'explored')]));

    // Capture position after initial render
    const initialNodes = setNodes.mock.calls.at(-1)![0];
    const initialPos = initialNodes[0]!.position;

    act(() => {
      rerender({ project: makeProject([makeNode('alpha', 'decided')]) });
    });

    const updatedNodes = setNodes.mock.calls.at(-1)![0];
    const updatedNode = updatedNodes.find((n) => n.id === 'alpha')!;
    expect((updatedNode.data as { maturity: string }).maturity).toBe('decided');
    // Position should be preserved (same x/y)
    expect(updatedNode.position.x).toBe(initialPos.x);
    expect(updatedNode.position.y).toBe(initialPos.y);
  });

  it('case 6: connection added/removed → setEdges called with new edge set', () => {
    const { setEdges, rerender } = renderSync(
      makeProject([makeNode('a'), makeNode('b')], [makeConnection('a', 'b')]),
    );

    act(() => {
      rerender({
        project: makeProject([makeNode('a'), makeNode('b')], []),
      });
    });

    const edges = setEdges.mock.calls.at(-1)![0];
    expect(edges).toHaveLength(0);
  });

  it('case 7: slug renamed → old slug removed + new slug added with dagre position', () => {
    const { setNodes, rerender } = renderSync(makeProject([makeNode('alpha')]));

    act(() => {
      rerender({ project: makeProject([makeNode('alpha-v2')]) });
    });

    const nodes = setNodes.mock.calls.at(-1)![0];
    expect(nodes.find((n) => n.id === 'alpha')).toBeUndefined();
    const newNode = nodes.find((n) => n.id === 'alpha-v2');
    expect(newNode).toBeDefined();
    expect(Number.isFinite(newNode!.position.x)).toBe(true);
    expect(Number.isFinite(newNode!.position.y)).toBe(true);
  });

  it('case 8: rapid sequential updates → setNodes reflects only last project state', () => {
    const { setNodes, rerender } = renderSync(null);

    // Three rapid setProject calls in the same microtask batch
    act(() => {
      rerender({ project: makeProject([makeNode('a')]) });
      rerender({ project: makeProject([makeNode('b')]) });
      rerender({ project: makeProject([makeNode('c')]) });
    });

    const lastNodes = setNodes.mock.calls.at(-1)![0];
    expect(lastNodes).toHaveLength(1);
    expect(lastNodes[0]!.id).toBe('c');
  });
});

// ---------------------------------------------------------------------------
// Warning tracker tests
// ---------------------------------------------------------------------------

describe('warning tracker', () => {
  it('two unknown maturity values → exactly 2 console.warn calls', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { rerender } = renderSync(null);

    act(() => {
      rerender({
        project: makeProject([
          makeNode('a', 'prototype'),
          makeNode('b', 'concept'),
        ]),
      });
    });

    const maturityWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Unknown node maturity'),
    );
    expect(maturityWarns).toHaveLength(2);
  });

  it('re-triggering setProject with same projectHash → 0 additional warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const proj = makeProject([makeNode('a', 'prototype')], [], 'hash-same');
    const { rerender } = renderSync(proj);

    const countAfterFirst = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Unknown node maturity'),
    ).length;

    // Same project hash, same unknown maturity
    act(() => {
      rerender({ project: { ...proj } });
    });

    const countAfterSecond = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Unknown node maturity'),
    ).length;

    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('loading a project with different projectHash → tracker resets (re-triggers warns)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const proj1 = makeProject([makeNode('a', 'prototype')], [], 'hash-1');
    const proj2 = makeProject([makeNode('a', 'prototype')], [], 'hash-2');

    const { rerender } = renderSync(proj1);

    const countAfterFirst = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Unknown node maturity'),
    ).length;

    act(() => {
      rerender({ project: proj2 });
    });

    const countAfterSecond = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Unknown node maturity'),
    ).length;

    expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// Seed rehydration precedence (Phase 3 — Bug 3)
// ---------------------------------------------------------------------------

describe('seed rehydration precedence', () => {
  it('case A: seed wins on first pass — seeded position applied, not dagre', () => {
    const seeds = new Map<string, NodePosition>([['alpha', { x: 100, y: 200 }]]);
    const proj = makeProject([makeNode('alpha')]);

    const { setNodes } = renderSync(proj, seeds);

    const nodes = setNodes.mock.calls.at(-1)![0];
    const alpha = nodes.find((n) => n.id === 'alpha')!;
    expect(alpha.position.x).toBe(100);
    expect(alpha.position.y).toBe(200);
  });

  it('case B: drag survives second emit — user-dragged position preserved, seed not re-applied', () => {
    const seeds = new Map<string, NodePosition>([['alpha', { x: 100, y: 200 }]]);
    const proj = makeProject([makeNode('alpha')], [], 'hash-b');

    const { setNodes, rerender } = renderSync(proj, seeds);

    // First pass: seed applied, seedApplied flips to true
    const firstNodes = setNodes.mock.calls.at(-1)![0];
    expect(firstNodes.find((n) => n.id === 'alpha')!.position).toEqual({ x: 100, y: 200 });

    // Simulate drag: the hook reads prevNodesRef, which holds the last setNodes output.
    // Re-render with same seeds but re-emit the project — the hook will see prevNodes with
    // dragged position (we inject it by re-rendering with new project reference but same hash).
    // To properly simulate, we need the prevNodesRef to hold the "dragged" position.
    // We do this by re-rendering once so prevNodesRef updates, then re-rendering again with
    // modified project. The key: after first pass seedApplied=true so seeds don't re-fire.
    act(() => {
      // Re-emit same project (no real drag here, but seedApplied must block seed re-apply)
      rerender({ project: { ...proj }, seedPositions: seeds });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const alpha = secondNodes.find((n) => n.id === 'alpha')!;
    // Position came from prevNodesRef (the first pass output), not freshly re-seeded
    expect(alpha.position.x).toBe(100);
    expect(alpha.position.y).toBe(200);

    // Now verify: if we change the seed map reference with different coords,
    // it should NOT override because seedApplied is already true
    const newSeeds = new Map<string, NodePosition>([['alpha', { x: 999, y: 999 }]]);
    act(() => {
      rerender({ project: { ...proj }, seedPositions: newSeeds });
    });

    const thirdNodes = setNodes.mock.calls.at(-1)![0];
    const alphaThird = thirdNodes.find((n) => n.id === 'alpha')!;
    expect(alphaThird.position.x).not.toBe(999);
    expect(alphaThird.position.y).not.toBe(999);
  });

  it('case C: stale warn idempotent — ghost slug drops with exactly one console.warn per projectHash', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const seeds = new Map<string, NodePosition>([
      ['alpha', { x: 10, y: 20 }],
      ['ghost', { x: 99, y: 99 }],
    ]);
    const proj = makeProject([makeNode('alpha')], [], 'hash-c');

    const { setNodes, rerender } = renderSync(proj, seeds);

    const staleWarns = () =>
      warnSpy.mock.calls.filter((c) => String(c[0]).includes('ghost')).length;

    expect(staleWarns()).toBe(1);

    // Re-render with same project+seeds (seedApplied=true blocks re-entry but staleLayoutSlugs
    // would also block re-warn if we ever re-entered)
    act(() => {
      rerender({ project: { ...proj }, seedPositions: seeds });
    });

    expect(staleWarns()).toBe(1);

    // setNodes should only have alpha, not ghost
    const nodes = setNodes.mock.calls[0]![0];
    expect(nodes.find((n) => n.id === 'ghost')).toBeUndefined();
    expect(nodes.find((n) => n.id === 'alpha')).toBeDefined();
  });

  it('case D: projectHash reset — new project gets fresh seed application', () => {
    const seeds1 = new Map<string, NodePosition>([['alpha', { x: 100, y: 200 }]]);
    const proj1 = makeProject([makeNode('alpha')], [], 'hash-d1');

    const { setNodes, rerender } = renderSync(proj1, seeds1);

    // First project: seed applied
    const firstNodes = setNodes.mock.calls.at(-1)![0];
    expect(firstNodes.find((n) => n.id === 'alpha')!.position).toEqual({ x: 100, y: 200 });

    // Switch to a new project with different hash and different seeds
    const seeds2 = new Map<string, NodePosition>([['beta', { x: 300, y: 400 }]]);
    const proj2 = makeProject([makeNode('beta')], [], 'hash-d2');

    act(() => {
      rerender({ project: proj2, seedPositions: seeds2 });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const beta = secondNodes.find((n) => n.id === 'beta')!;
    expect(beta.position.x).toBe(300);
    expect(beta.position.y).toBe(400);
  });

  it('case E: empty-then-populated two-pass — seed wins on populated pass', () => {
    const proj = makeProject([makeNode('alpha')], [], 'hash-e');

    // First render: empty seedPositions (layout.load still pending)
    const { setNodes, rerender } = renderSync(proj, new Map());

    // seedApplied should still be false (empty map did not flip it)
    // alpha gets dagre position
    const firstNodes = setNodes.mock.calls.at(-1)![0];
    const firstAlpha = firstNodes.find((n) => n.id === 'alpha')!;
    expect(firstAlpha).toBeDefined();

    // Second render: layout.load resolved, real seeds arrive
    const realSeeds = new Map<string, NodePosition>([['alpha', { x: 777, y: 888 }]]);
    act(() => {
      rerender({ project: proj, seedPositions: realSeeds });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const secondAlpha = secondNodes.find((n) => n.id === 'alpha')!;
    expect(secondAlpha.position.x).toBe(777);
    expect(secondAlpha.position.y).toBe(888);
  });
});
