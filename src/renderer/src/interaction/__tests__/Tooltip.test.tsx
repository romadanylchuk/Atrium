import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useAtriumStore } from '../../store/atriumStore';
import { Tooltip } from '../Tooltip';
import type { ProjectState } from '@shared/domain';

const spawnMock = vi.fn();

vi.stubGlobal('atrium', {
  skill: { spawn: spawnMock },
});

const fixtureProject: ProjectState = {
  rootPath: '/projects/my-app',
  projectName: 'My App',
  projectHash: 'abc123',
  context: { description: '', sections: {} },
  nodes: [
    {
      slug: 'canvas-ui',
      name: 'Canvas UI',
      maturity: 'decided',
      priority: 'core',
      file: 'ideas/canvas-ui.md',
      summary: 'Interactive node graph',
      description: 'Renders nodes as a graph',
      sections: {},
    },
  ],
  connections: [],
  sessions: [],
  warnings: [],
};

beforeEach(() => {
  spawnMock.mockReset();
  useAtriumStore.setState({
    project: fixtureProject,
    tooltipTarget: null,
    terminal: { id: null, status: 'idle', fullscreen: false },
  });
  // Stub getBoundingClientRect for a fake node element
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 800);
});

afterEach(() => {
  cleanup();
});

describe('Tooltip', () => {
  it('renders nothing when tooltipTarget is null', () => {
    render(<Tooltip />);
    expect(screen.queryByTestId('node-tooltip')).toBeNull();
  });

  it('renders nothing when slug has no matching node in project', () => {
    useAtriumStore.setState({ tooltipTarget: 'nonexistent' });
    render(<Tooltip />);
    expect(screen.queryByTestId('node-tooltip')).toBeNull();
  });

  it('renders tooltip with name, maturity badge, summary when target is set and node element exists', () => {
    // Create a fake node element in DOM for getBoundingClientRect
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({ tooltipTarget: 'canvas-ui' });
    render(<Tooltip />);

    expect(screen.getByTestId('node-tooltip')).toBeTruthy();
    expect(screen.getByText('Canvas UI')).toBeTruthy();
    expect(screen.getByTestId('maturity-badge').textContent).toBe('decided');
    expect(screen.getByText('Interactive node graph')).toBeTruthy();
    document.body.removeChild(fakeNode);
  });

  it('renders 3 skill buttons: Explore, Decide, Map', () => {
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({ tooltipTarget: 'canvas-ui' });
    render(<Tooltip />);

    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.getByText('Decide')).toBeTruthy();
    expect(screen.getByText('Map')).toBeTruthy();
    document.body.removeChild(fakeNode);
  });

  it('clicking Explore calls skill.spawn with correct args and dismisses tooltip on ok', async () => {
    const terminalId = 'term-42' as import('@shared/domain').TerminalId;
    spawnMock.mockResolvedValue({ ok: true, data: terminalId });

    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({ tooltipTarget: 'canvas-ui' });
    render(<Tooltip />);

    fireEvent.click(screen.getByText('Explore'));
    await act(async () => {});

    expect(spawnMock).toHaveBeenCalledWith({
      skill: 'explore',
      nodes: ['canvas-ui'],
      cwd: '/projects/my-app',
    });
    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('spawn err → tooltip stays open + shows error message', async () => {
    spawnMock.mockResolvedValue({ ok: false, error: { code: 'SPAWN_FAILED', message: 'pty died' } });

    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({ tooltipTarget: 'canvas-ui' });
    render(<Tooltip />);

    fireEvent.click(screen.getByText('Decide'));
    await act(async () => {});

    expect(useAtriumStore.getState().tooltipTarget).toBe('canvas-ui');
    expect(screen.getByTestId('spawn-error').textContent).toBe('Skill failed: pty died');
    document.body.removeChild(fakeNode);
  });

  it('Escape key dismisses tooltip', () => {
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({ tooltipTarget: 'canvas-ui' });
    render(<Tooltip />);

    expect(screen.getByTestId('node-tooltip')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('multiple rapid Escape presses are idempotent', () => {
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({ tooltipTarget: 'canvas-ui' });
    render(<Tooltip />);

    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(document, { key: 'Escape' });
    }

    expect(useAtriumStore.getState().tooltipTarget).toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('skill buttons are disabled when terminal is active', () => {
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({
      tooltipTarget: 'canvas-ui',
      terminal: { id: null, status: 'active', fullscreen: false },
    });
    render(<Tooltip />);

    expect(screen.getByText('Explore').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText('Decide').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText('Map').getAttribute('disabled')).not.toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('skill buttons are disabled when terminal is spawning', () => {
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({
      tooltipTarget: 'canvas-ui',
      terminal: { id: null, status: 'spawning', fullscreen: false },
    });
    render(<Tooltip />);

    expect(screen.getByText('Explore').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText('Decide').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText('Map').getAttribute('disabled')).not.toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('skill buttons are enabled when terminal is idle', () => {
    spawnMock.mockResolvedValue({ ok: true, data: 'term-1' });
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({
      tooltipTarget: 'canvas-ui',
      terminal: { id: null, status: 'idle', fullscreen: false },
    });
    render(<Tooltip />);

    expect(screen.getByText('Explore').getAttribute('disabled')).toBeNull();
    expect(screen.getByText('Decide').getAttribute('disabled')).toBeNull();
    expect(screen.getByText('Map').getAttribute('disabled')).toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('skill buttons are enabled when terminal is exited', () => {
    spawnMock.mockResolvedValue({ ok: true, data: 'term-1' });
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({
      tooltipTarget: 'canvas-ui',
      terminal: { id: 'term-x' as import('@shared/domain').TerminalId, status: 'exited', fullscreen: false },
    });
    render(<Tooltip />);

    expect(screen.getByText('Explore').getAttribute('disabled')).toBeNull();
    expect(screen.getByText('Decide').getAttribute('disabled')).toBeNull();
    expect(screen.getByText('Map').getAttribute('disabled')).toBeNull();
    document.body.removeChild(fakeNode);
  });

  it('clicking a disabled skill button does not call spawn', async () => {
    const fakeNode = document.createElement('div');
    fakeNode.setAttribute('data-id', 'canvas-ui');
    vi.spyOn(fakeNode, 'getBoundingClientRect').mockReturnValue({
      left: 200, top: 200, right: 260, bottom: 240,
      width: 60, height: 40, x: 200, y: 200, toJSON: () => ({}),
    });
    document.body.appendChild(fakeNode);

    useAtriumStore.setState({
      tooltipTarget: 'canvas-ui',
      terminal: { id: null, status: 'active', fullscreen: false },
    });
    render(<Tooltip />);

    fireEvent.click(screen.getByText('Explore'));
    await act(async () => {});

    expect(spawnMock).not.toHaveBeenCalled();
    document.body.removeChild(fakeNode);
  });
});
