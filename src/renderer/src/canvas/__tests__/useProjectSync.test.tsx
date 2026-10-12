import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectSync } from '../useProjectSync';
import { useAtriumStore } from '../../store/atriumStore';
import type { ProjectState, NodeData, Connection } from '@shared/domain';
import type { Node as RFNode, Edge as RFEdge } from 'reactflow';
import type { NodePosition } from '@shared/layout';

const DEFAULT_VIEWPORT_CENTER: NodePosition = { x: 500, y: 300 };

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

function makeConnection(from: string, to: string, type = 'dependency'): Connection {
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
  initialRelayoutId = 0,
  options?: {
    /** Override the default getLiveNodes (which mirrors the last setNodes call). */
    getLiveNodes?: () => RFNode[];
    /** Override the default viewport center (default `DEFAULT_VIEWPORT_CENTER`). */
    getViewportCenter?: () => NodePosition;
  },
) {
  let lastEmitted: RFNode[] = [];
  const setNodes = vi.fn<(nodes: RFNode[]) => void>().mockImplementation((n) => {
    lastEmitted = n;
  });
  const setEdges = vi.fn<(edges: RFEdge[]) => void>();

  // Default: mirror the last setNodes output so most existing tests behave as before.
  const liveNodesOverrideRef: { current: (() => RFNode[]) | null } = {
    current: options?.getLiveNodes ?? null,
  };
  const viewportCenterOverrideRef: { current: (() => NodePosition) | null } = {
    current: options?.getViewportCenter ?? null,
  };
  const getLiveNodes = (): RFNode[] =>
    liveNodesOverrideRef.current ? liveNodesOverrideRef.current() : lastEmitted;
  const getViewportCenter = (): NodePosition =>
    viewportCenterOverrideRef.current ? viewportCenterOverrideRef.current() : DEFAULT_VIEWPORT_CENTER;

  type Props = { project: ProjectState | null; seedPositions?: Map<string, NodePosition>; relayoutRequestId?: number };
  const { rerender } = renderHook(
    ({ project, seedPositions, relayoutRequestId }: Props) => {
      useProjectSync({
        project,
        seedPositions,
        setNodes,
        setEdges,
        relayoutRequestId,
        getLiveNodes,
        getViewportCenter,
      });
    },
    { initialProps: { project: initialProject, seedPositions: initialSeedPositions, relayoutRequestId: initialRelayoutId } as Props },
  );

  return {
    setNodes,
    setEdges,
    rerender,
    setLiveNodesOverride: (fn: (() => RFNode[]) | null) => {
      liveNodesOverrideRef.current = fn;
    },
    setViewportCenterOverride: (fn: (() => NodePosition) | null) => {
      viewportCenterOverrideRef.current = fn;
    },
  };
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

  it('case 7: slug renamed → new slug placed at viewport center', () => {
    const { setNodes, rerender } = renderSync(makeProject([makeNode('alpha')]));

    act(() => {
      rerender({ project: makeProject([makeNode('alpha-v2')]) });
    });

    const nodes = setNodes.mock.calls.at(-1)![0];
    expect(nodes.find((n) => n.id === 'alpha')).toBeUndefined();
    const newNode = nodes.find((n) => n.id === 'alpha-v2');
    expect(newNode).toBeDefined();
    expect(newNode!.position).toEqual(DEFAULT_VIEWPORT_CENTER);
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
// markerEnd per-edge colour
// ---------------------------------------------------------------------------

describe('markerEnd coloring', () => {
  it('edges get markerEnd with resolved color matching the connection style', () => {
    const proj = makeProject(
      [makeNode('a'), makeNode('b')],
      [makeConnection('a', 'b', 'dependency')],
    );

    const { setEdges } = renderSync(proj);

    const edges = setEdges.mock.calls.at(-1)![0];
    expect(edges).toHaveLength(1);
    const edge = edges[0]!;
    expect(edge.markerEnd).toBeDefined();
    expect((edge.markerEnd as { color: string }).color).toBe('#5b8fd4');
  });

  it('unknown connection type gets unknown color for markerEnd', () => {
    const proj = makeProject(
      [makeNode('a'), makeNode('b')],
      [makeConnection('a', 'b', 'unknown-type')],
    );

    const { setEdges } = renderSync(proj);

    const edges = setEdges.mock.calls.at(-1)![0];
    const edge = edges[0]!;
    expect((edge.markerEnd as { color: string }).color).toBe('#6a6a72');
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

  it('unknown connection warning format includes edge-id and is dev-gated', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // DEV is true in Vitest by default
    const proj = makeProject(
      [makeNode('a'), makeNode('b')],
      [makeConnection('a', 'b', 'weird-rel')],
    );
    renderSync(proj);
    const msg = String(
      warnSpy.mock.calls.find((c) => String(c[0]).includes('Unknown connection type'))?.[0] ?? '',
    );
    expect(msg).toContain('"weird-rel"');
    expect(msg).toContain('on edge a-b-0');
    expect(msg).toContain('Falling back to unknown style');
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

  it('case F: all-identical seeds → dagre runs (positions are not all 0,0)', () => {
    const seeds = new Map<string, NodePosition>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 0 }],
      ['c', { x: 0, y: 0 }],
    ]);
    const proj = makeProject(
      [makeNode('a'), makeNode('b'), makeNode('c')],
      [makeConnection('a', 'b'), makeConnection('b', 'c')],
      'hash-f',
    );

    const { setNodes } = renderSync(proj, seeds);

    const nodes = setNodes.mock.calls.at(-1)![0];
    expect(nodes).toHaveLength(3);
    // All dagre positions should not be identical {0,0}
    const uniquePositions = new Set(nodes.map((n) => `${n.position.x}_${n.position.y}`));
    expect(uniquePositions.size).toBeGreaterThan(1);
  });

  it('case F2: all-identical seeds → second render preserves first-render positions (no re-dagre)', () => {
    // Pins the seedApplied=true short-circuit on the all-identical-seeds path: the second
    // render must not re-fire dagre (no relayout) and must not re-stack nodes at the seed
    // origin; it should read positions back from the live store (mirrored setNodes output).
    const seeds = new Map<string, NodePosition>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 0, y: 0 }],
      ['c', { x: 0, y: 0 }],
    ]);
    const proj = makeProject(
      [makeNode('a'), makeNode('b'), makeNode('c')],
      [makeConnection('a', 'b'), makeConnection('b', 'c')],
      'hash-f2',
    );

    const { setNodes, rerender } = renderSync(proj, seeds);

    const firstNodes = setNodes.mock.calls.at(-1)![0];
    const firstPositions = new Map(firstNodes.map((n) => [n.id, { ...n.position }]));

    act(() => {
      rerender({ project: { ...proj }, seedPositions: seeds });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    expect(secondNodes).toHaveLength(3);
    for (const n of secondNodes) {
      expect(n.position).toEqual(firstPositions.get(n.id));
    }
  });

  it('case G: relayoutRequestId increment forces dagre re-run, changing all positions', () => {
    const seeds = new Map<string, NodePosition>([
      ['a', { x: 100, y: 100 }],
      ['b', { x: 200, y: 200 }],
      ['c', { x: 300, y: 300 }],
    ]);
    const proj = makeProject(
      [makeNode('a'), makeNode('b'), makeNode('c')],
      [makeConnection('a', 'b'), makeConnection('b', 'c')],
      'hash-g',
    );

    const { setNodes, rerender, setLiveNodesOverride } = renderSync(proj, seeds, 0);

    // After first render with seeds applied, positions come from seeds
    const firstNodes = setNodes.mock.calls.at(-1)![0];
    const firstPositions = new Map(firstNodes.map((n) => [n.id, n.position]));

    // Simulate user-drag positions so we can assert relayout does not preserve them either
    const dragPositions = new Map<string, NodePosition>([
      ['a', { x: 1, y: 1 }],
      ['b', { x: 2, y: 2 }],
      ['c', { x: 3, y: 3 }],
    ]);
    setLiveNodesOverride(() =>
      firstNodes.map((n) => ({ ...n, position: dragPositions.get(n.id)! })),
    );

    // Trigger relayout by incrementing relayoutRequestId
    act(() => {
      rerender({ project: proj, seedPositions: seeds, relayoutRequestId: 1 });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    expect(secondNodes).toHaveLength(3);
    // Positions should have changed from seed values AND from the drag (live) values (dagre ran)
    const secondPositions = new Map(secondNodes.map((n) => [n.id, n.position]));
    const allUnchangedFromSeed = ['a', 'b', 'c'].every(
      (id) =>
        secondPositions.get(id)!.x === firstPositions.get(id)!.x &&
        secondPositions.get(id)!.y === firstPositions.get(id)!.y,
    );
    expect(allUnchangedFromSeed).toBe(false);
    const anyMatchesDrag = ['a', 'b', 'c'].some(
      (id) =>
        secondPositions.get(id)!.x === dragPositions.get(id)!.x &&
        secondPositions.get(id)!.y === dragPositions.get(id)!.y,
    );
    expect(anyMatchesDrag).toBe(false);
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

// ---------------------------------------------------------------------------
// Sticky-position + viewport-center cases (H, I, J, K, L)
// ---------------------------------------------------------------------------

describe('sticky positions + viewport-center add', () => {
  it('case H: position read from getLiveNodes survives re-sync (simulated drag)', () => {
    const proj = makeProject([makeNode('alpha')], [], 'hash-h');

    const { setNodes, rerender, setLiveNodesOverride } = renderSync(proj);

    // After first render, alpha has a dagre position
    const firstNodes = setNodes.mock.calls.at(-1)![0];
    const firstAlpha = firstNodes.find((n) => n.id === 'alpha')!;
    expect(firstAlpha).toBeDefined();

    // Simulate user drag: getLiveNodes now reports alpha at {555,666}
    setLiveNodesOverride(() => [{ ...firstAlpha, position: { x: 555, y: 666 } }]);

    act(() => {
      rerender({ project: { ...proj } });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const secondAlpha = secondNodes.find((n) => n.id === 'alpha')!;
    expect(secondAlpha.position).toEqual({ x: 555, y: 666 });
  });

  it('case I: maturity change preserves dragged position', () => {
    const proj = makeProject([makeNode('alpha', 'explored')], [], 'hash-i');

    const { setNodes, rerender, setLiveNodesOverride } = renderSync(proj);
    const firstNodes = setNodes.mock.calls.at(-1)![0];
    const firstAlpha = firstNodes.find((n) => n.id === 'alpha')!;

    setLiveNodesOverride(() => [{ ...firstAlpha, position: { x: 555, y: 666 } }]);

    act(() => {
      rerender({ project: makeProject([makeNode('alpha', 'decided')], [], 'hash-i') });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const secondAlpha = secondNodes.find((n) => n.id === 'alpha')!;
    expect(secondAlpha.position).toEqual({ x: 555, y: 666 });
    expect((secondAlpha.data as { maturity: string }).maturity).toBe('decided');
  });

  it('case J: new slug mid-session lands at viewport center, not dagre', () => {
    const proj1 = makeProject([makeNode('alpha')], [], 'hash-j');
    const { setNodes, rerender } = renderSync(proj1);

    const firstNodes = setNodes.mock.calls.at(-1)![0];
    const alphaPos = firstNodes.find((n) => n.id === 'alpha')!.position;

    act(() => {
      rerender({ project: makeProject([makeNode('alpha'), makeNode('beta')], [], 'hash-j') });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const alpha = secondNodes.find((n) => n.id === 'alpha')!;
    const beta = secondNodes.find((n) => n.id === 'beta')!;
    expect(alpha.position).toEqual(alphaPos);
    expect(beta.position).toEqual(DEFAULT_VIEWPORT_CENTER);
  });

  it('case K: multiple new slugs in same tick stack at viewport center', () => {
    const proj1 = makeProject([makeNode('alpha')], [], 'hash-k');
    const { setNodes, rerender } = renderSync(proj1);

    act(() => {
      rerender({
        project: makeProject(
          [makeNode('alpha'), makeNode('beta'), makeNode('gamma')],
          [],
          'hash-k',
        ),
      });
    });

    const nodes = setNodes.mock.calls.at(-1)![0];
    const beta = nodes.find((n) => n.id === 'beta')!;
    const gamma = nodes.find((n) => n.id === 'gamma')!;
    expect(beta.position).toEqual(DEFAULT_VIEWPORT_CENTER);
    expect(gamma.position).toEqual(DEFAULT_VIEWPORT_CENTER);
  });

  it('case L: relayout runs dagre even when getLiveNodes reports dragged positions', () => {
    const seeds = new Map<string, NodePosition>([
      ['a', { x: 100, y: 100 }],
      ['b', { x: 200, y: 200 }],
      ['c', { x: 300, y: 300 }],
    ]);
    const proj = makeProject(
      [makeNode('a'), makeNode('b'), makeNode('c')],
      [makeConnection('a', 'b'), makeConnection('b', 'c')],
      'hash-l',
    );

    const { setNodes, rerender, setLiveNodesOverride } = renderSync(proj, seeds, 0);
    const firstNodes = setNodes.mock.calls.at(-1)![0];

    const dragPositions = new Map<string, NodePosition>([
      ['a', { x: 1, y: 1 }],
      ['b', { x: 2, y: 2 }],
      ['c', { x: 3, y: 3 }],
    ]);
    setLiveNodesOverride(() =>
      firstNodes.map((n) => ({ ...n, position: dragPositions.get(n.id)! })),
    );

    act(() => {
      rerender({ project: proj, seedPositions: seeds, relayoutRequestId: 1 });
    });

    const secondNodes = setNodes.mock.calls.at(-1)![0];
    const secondPositions = new Map(secondNodes.map((n) => [n.id, n.position]));

    // Not dragged
    for (const id of ['a', 'b', 'c']) {
      const p = secondPositions.get(id)!;
      expect(p).not.toEqual(dragPositions.get(id));
    }
    // Not all identical
    const uniqueKeys = new Set(secondNodes.map((n) => `${n.position.x}_${n.position.y}`));
    expect(uniqueKeys.size).toBeGreaterThan(1);
  });
});
