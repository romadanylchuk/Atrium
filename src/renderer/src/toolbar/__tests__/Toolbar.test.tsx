import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { Toolbar } from '../Toolbar';
import type { ProjectState } from '@shared/domain';
import type { SkillSpawnRequest } from '@shared/skill/spawn';

const fakeProject: ProjectState = {
  rootPath: '/my-project',
  projectName: 'My Project',
  projectHash: 'h1',
  context: { description: '', sections: {} },
  nodes: [
    {
      slug: 'canvas-ui',
      name: 'Canvas UI',
      priority: 'core',
      maturity: 'decided',
      file: 'ideas/canvas-ui.md',
      summary: '',
      description: '',
      sections: {},
    },
    {
      slug: 'cli-engine',
      name: 'CLI Engine',
      priority: 'core',
      maturity: 'ready',
      file: 'ideas/cli-engine.md',
      summary: '',
      description: '',
      sections: {},
    },
  ],
  connections: [],
  sessions: [],
  warnings: [],
};

const spawnMock = vi.fn();

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockResolvedValue({ ok: true, data: 'term-1' });

  vi.stubGlobal('atrium', {
    skill: { spawn: spawnMock },
    project: { getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  });

  useAtriumStore.setState({
    project: fakeProject,
    selectedNodes: new Set(),
    terminal: { id: null, status: 'idle', fullscreen: false },
    toolbarOverlay: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Toolbar', () => {
  it('renders 5 buttons in order', () => {
    render(<Toolbar />);
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toContain('Explore');
    expect(labels).toContain('Decide');
    expect(labels).toContain('Map');
    expect(labels).toContain('Status');
    expect(labels).toContain('Finalize');
    // order check
    const idx = (name: string) => labels.indexOf(name);
    expect(idx('Explore')).toBeLessThan(idx('Decide'));
    expect(idx('Decide')).toBeLessThan(idx('Map'));
    expect(idx('Map')).toBeLessThan(idx('Status'));
    expect(idx('Status')).toBeLessThan(idx('Finalize'));
  });

  it('Explore click dispatches skill:spawn with skill=explore and no nodes when nothing selected', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith<[SkillSpawnRequest]>({
      skill: 'explore',
      nodes: [],
      cwd: '/my-project',
    });
  });

  it('Explore click passes selected node slugs', async () => {
    useAtriumStore.setState({ selectedNodes: new Set(['canvas-ui', 'cli-engine']) });
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith<[SkillSpawnRequest]>({
      skill: 'explore',
      nodes: ['canvas-ui', 'cli-engine'],
      cwd: '/my-project',
    });
  });

  it('Decide click dispatches skill=decide', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-decide'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    const req = spawnMock.mock.lastCall?.[0] as SkillSpawnRequest;
    expect(req.skill).toBe('decide');
  });

  it('Map click dispatches skill=map', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-map'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    const req = spawnMock.mock.lastCall?.[0] as SkillSpawnRequest;
    expect(req.skill).toBe('map');
  });

  it('Status click opens StatusPanel without calling spawn', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-status'));
    expect(screen.getByTestId('status-panel')).toBeDefined();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('StatusPanel closes when Close clicked', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-status'));
    expect(screen.getByTestId('status-panel')).toBeDefined();
    fireEvent.click(screen.getByTestId('status-panel-close'));
    expect(screen.queryByTestId('status-panel')).toBeNull();
  });

  it('Finalize click opens FinalizePanel without calling spawn', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-finalize'));
    expect(screen.getByTestId('finalize-panel')).toBeDefined();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('FinalizePanel Close button dismisses panel without spawning', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-finalize'));
    fireEvent.click(screen.getByTestId('finalize-panel-close'));
    expect(screen.queryByTestId('finalize-panel')).toBeNull();
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('FinalizePanel Continue calls spawn and closes panel', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-finalize'));
    fireEvent.click(screen.getByTestId('finalize-panel-continue'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    const req = spawnMock.mock.lastCall?.[0] as SkillSpawnRequest;
    expect(req.skill).toBe('finalize');
    expect(screen.queryByTestId('finalize-panel')).toBeNull();
  });

  it('Explore/Decide/Map disabled when terminal active; Status and Finalize remain enabled', () => {
    useAtriumStore.setState({ terminal: { id: 'term-1' as ReturnType<typeof useAtriumStore.getState>['terminal']['id'], status: 'active', fullscreen: false } });
    render(<Toolbar />);
    expect(screen.getByTestId('toolbar-btn-explore').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-decide').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-map').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-finalize').getAttribute('disabled')).toBeNull();
    expect(screen.getByTestId('toolbar-btn-status').getAttribute('disabled')).toBeNull();
  });

  it('FinalizePanel Continue is disabled when terminal is active', () => {
    useAtriumStore.setState({ terminal: { id: 'term-1' as ReturnType<typeof useAtriumStore.getState>['terminal']['id'], status: 'active', fullscreen: false } });
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-finalize'));
    expect(screen.getByTestId('finalize-panel-continue').getAttribute('disabled')).not.toBeNull();
  });

  it('shows inline error when spawn fails', async () => {
    spawnMock.mockResolvedValue({ ok: false, error: { code: 'TERMINAL_BUSY', message: 'busy' } });
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    await waitFor(() => expect(screen.getByTestId('toolbar-error')).toBeDefined());
    expect(screen.getByTestId('toolbar-error').textContent).toContain('busy');
  });
});
