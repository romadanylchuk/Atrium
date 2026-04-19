import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AtriumNode } from '../AtriumNode';
import { AtriumEdge } from '../AtriumEdge';
import type { NodeProps, EdgeProps } from 'reactflow';
import type { AtriumNodeData } from '../AtriumNode';
import type { AtriumEdgeData } from '../AtriumEdge';
import { useAtriumStore } from '../../store/atriumStore';

// Stub React Flow internals — Handle and BaseEdge require a store context
// that doesn't exist in jsdom. We only care about the data-attribute output.
vi.mock('reactflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('reactflow')>();
  return {
    ...actual,
    Handle: () => null,
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    getBezierPath: () => ['M0 0', 0, 0] as [string, number, number],
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  };
});

// ---------------------------------------------------------------------------
// AtriumNode — unknown maturity DOM round-trip
// ---------------------------------------------------------------------------

describe('AtriumNode unknown maturity', () => {
  it('renders data-unknown-maturity attribute with raw string value', () => {
    const props = {
      data: { slug: 'x', name: 'X', maturity: 'prototype' },
    } as unknown as NodeProps<AtriumNodeData>;

    const { container } = render(<AtriumNode {...props} />);

    const badge = container.querySelector('[data-unknown-maturity="prototype"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('prototype');
  });

  it('does NOT render data-unknown-maturity for a known maturity', () => {
    const props = {
      data: { slug: 'x', name: 'X', maturity: 'decided' },
    } as unknown as NodeProps<AtriumNodeData>;

    const { container } = render(<AtriumNode {...props} />);

    expect(container.querySelector('[data-unknown-maturity]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AtriumEdge — unknown connection-type DOM round-trip
// ---------------------------------------------------------------------------

describe('AtriumEdge unknown connection type', () => {
  const baseEdgeProps = {
    id: 'e1',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'bottom',
    targetPosition: 'top',
    source: 'a',
    target: 'b',
    selected: false,
    animated: false,
    interactionWidth: 20,
    markerStart: undefined,
    markerEnd: undefined,
    style: {},
    label: undefined,
    labelStyle: {},
    labelShowBg: false,
    labelBgStyle: {},
    labelBgPadding: [0, 0] as [number, number],
    labelBgBorderRadius: 0,
    pathOptions: {},
  };

  it('renders data-unknown-type attribute with raw string value', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'unknown-rel' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);

    const label = container.querySelector('[data-unknown-type="unknown-rel"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('unknown-rel');
  });

  it('does NOT render data-unknown-type for a known connection type', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'depends-on' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);

    expect(container.querySelector('[data-unknown-type]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AtriumNode — click / right-click event handlers
// ---------------------------------------------------------------------------

describe('AtriumNode event handlers', () => {
  const nodeProps = {
    data: { slug: 'canvas-ui', name: 'Canvas UI', maturity: 'decided' },
  } as unknown as NodeProps<AtriumNodeData>;

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

  it('left-click sets tooltipTarget to the node slug', () => {
    const { container } = render(<AtriumNode {...nodeProps} />);
    fireEvent.click(container.firstElementChild!);
    expect(useAtriumStore.getState().tooltipTarget).toBe('canvas-ui');
  });

  it('second left-click on same node toggles tooltipTarget to null', () => {
    const { container } = render(<AtriumNode {...nodeProps} />);
    fireEvent.click(container.firstElementChild!);
    fireEvent.click(container.firstElementChild!);
    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
  });

  it('right-click calls toggleSelectedNode and prevents default', () => {
    const { container } = render(<AtriumNode {...nodeProps} />);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    container.firstElementChild!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(useAtriumStore.getState().selectedNodes.has('canvas-ui')).toBe(true);
  });

  it('second right-click deselects the node', () => {
    const { container } = render(<AtriumNode {...nodeProps} />);
    const elem = container.firstElementChild!;
    fireEvent.contextMenu(elem);
    fireEvent.contextMenu(elem);
    expect(useAtriumStore.getState().selectedNodes.has('canvas-ui')).toBe(false);
  });

  it('right-click while tooltip is visible dismisses tooltip and toggles selection', () => {
    useAtriumStore.setState({ tooltipTarget: 'some-other-node' });
    const { container } = render(<AtriumNode {...nodeProps} />);
    fireEvent.contextMenu(container.firstElementChild!);
    const s = useAtriumStore.getState();
    expect(s.tooltipTarget).toBeNull();
    expect(s.selectedNodes.has('canvas-ui')).toBe(true);
  });
});
