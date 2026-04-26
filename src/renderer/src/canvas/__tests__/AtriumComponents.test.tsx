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
// AtriumNode — node dimensions and palette
// ---------------------------------------------------------------------------

describe('AtriumNode visual style', () => {
  it('ready node renders with border-radius 6px', () => {
    const props = {
      data: { slug: 'x', name: 'X', maturity: 'ready' },
    } as unknown as NodeProps<AtriumNodeData>;
    const { container } = render(<AtriumNode {...props} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.borderRadius).toBe('6px');
  });

  it('decided node renders with border-radius 3px', () => {
    const props = {
      data: { slug: 'x', name: 'X', maturity: 'decided' },
    } as unknown as NodeProps<AtriumNodeData>;
    const { container } = render(<AtriumNode {...props} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.borderRadius).toBe('3px');
  });

  it('raw-idea node renders with border-radius 50% / 50%', () => {
    const props = {
      data: { slug: 'x', name: 'X', maturity: 'raw-idea' },
    } as unknown as NodeProps<AtriumNodeData>;
    const { container } = render(<AtriumNode {...props} />);
    const el = container.firstElementChild as HTMLElement;
    // CSS ellipse approximation
    expect(el.style.borderRadius).toContain('50%');
  });

  it('node has width 96px and height 36px', () => {
    const props = {
      data: { slug: 'x', name: 'X', maturity: 'explored' },
    } as unknown as NodeProps<AtriumNodeData>;
    const { container } = render(<AtriumNode {...props} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('96px');
    expect(el.style.height).toBe('36px');
  });
});

// ---------------------------------------------------------------------------
// AtriumEdge — unknown connection-type DOM round-trip + hover tooltip
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
  });

  it('unknown edge tooltip is hidden by default', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'unknown-rel' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);
    const label = container.querySelector('[data-unknown-type="unknown-rel"]') as HTMLElement;
    expect(label.style.display).toBe('none');
  });

  it('unknown edge tooltip appears on hover and disappears on mouse leave', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'unknown-rel' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);
    const wrapper = container.querySelector('.nodrag') as HTMLElement;
    const label = container.querySelector('[data-unknown-type="unknown-rel"]') as HTMLElement;

    fireEvent.mouseEnter(wrapper);
    expect(label.style.display).toBe('block');
    expect(label.textContent).toContain('unknown-rel');

    fireEvent.mouseLeave(wrapper);
    expect(label.style.display).toBe('none');
  });

  it('does NOT render data-unknown-type for a known connection type', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'dependency' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);

    expect(container.querySelector('[data-unknown-type]')).toBeNull();
  });

  it('renders data-known-type attribute for a known connection type', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'dependency' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);

    expect(container.querySelector('[data-known-type="dependency"]')).not.toBeNull();
    expect(container.querySelector('[data-unknown-type]')).toBeNull();
  });

  it('known edge tooltip is hidden by default', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'dependency' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);
    const label = container.querySelector('[data-known-type="dependency"]') as HTMLElement;
    expect(label.style.display).toBe('none');
  });

  it('known edge tooltip shows "type: dependency" on hover', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'dependency' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);
    const wrapper = container.querySelector('.nodrag') as HTMLElement;
    const label = container.querySelector('[data-known-type="dependency"]') as HTMLElement;

    fireEvent.mouseEnter(wrapper);
    expect(label.style.display).toBe('block');
    expect(label.textContent).toBe('type: dependency');
    fireEvent.mouseLeave(wrapper);
    expect(label.style.display).toBe('none');
  });

  it('unknown edge tooltip shows "type: weird-rel (unknown)" on hover', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'weird-rel' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);
    const wrapper = container.querySelector('.nodrag') as HTMLElement;
    const label = container.querySelector('[data-unknown-type="weird-rel"]') as HTMLElement;

    fireEvent.mouseEnter(wrapper);
    expect(label.style.display).toBe('block');
    expect(label.textContent).toBe('type: weird-rel (unknown)');
  });
});

// ---------------------------------------------------------------------------
// AtriumEdge — known edge stroke styles
// ---------------------------------------------------------------------------

describe('AtriumEdge stroke styles', () => {
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

  // BaseEdge is mocked to null so we test via the absence of data-unknown-type
  // and the fact that no EdgeLabelRenderer is rendered for known types
  it('shared-concern edge does not render unknown-type label', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'shared-concern' },
    } as unknown as EdgeProps<AtriumEdgeData>;

    const { container } = render(<AtriumEdge {...props} />);
    expect(container.querySelector('[data-unknown-type]')).toBeNull();
  });

  it('dependency edge does not render unknown-type label', () => {
    const props = {
      ...baseEdgeProps,
      data: { type: 'dependency' },
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
