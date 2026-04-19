import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectSync } from '../useProjectSync';
import { useAtriumStore } from '../../store/atriumStore';
import type { ProjectState, NodeData, Connection } from '@shared/domain';
import type { Node as RFNode, Edge as RFEdge } from 'reactflow';

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

function renderSync(initialProject: ProjectState | null = null) {
  const setNodes = vi.fn<(nodes: RFNode[]) => void>();
  const setEdges = vi.fn<(edges: RFEdge[]) => void>();

  const { rerender } = renderHook(
    ({ project }: { project: ProjectState | null }) => {
      useProjectSync({ project, setNodes, setEdges });
    },
    { initialProps: { project: initialProject } },
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
