import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
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
const runDetachedMock = vi.fn();

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockResolvedValue({ ok: true, data: 'term-1' });
  runDetachedMock.mockReset();
  runDetachedMock.mockResolvedValue({ ok: true, data: { exitCode: 0, stdout: '' } });

  vi.stubGlobal('atrium', {
    skill: { spawn: spawnMock, runDetached: runDetachedMock },
    project: { getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
  });

  useAtriumStore.setState({
    project: fakeProject,
    selectedNodes: new Set(),
    terminal: { id: null, status: 'idle', fullscreen: false },
    toolbarOverlay: null,
    claudeStatus: 'checking',
    claudeInfo: null,
    detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'idle' } },
    lastDetachedError: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Toolbar', () => {
  it('renders 9 buttons in order', () => {
    render(<Toolbar />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(9);
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toContain('Free Terminal');
    expect(labels).toContain('New');
    expect(labels).toContain('Triage');
    expect(labels).toContain('Explore');
    expect(labels).toContain('Decide');
    expect(labels).toContain('Map');
    expect(labels).toContain('Audit');
    expect(labels).toContain('Status');
    expect(labels).toContain('Finalize');
    // order check
    const idx = (name: string) => labels.indexOf(name);
    expect(idx('Free Terminal')).toBeLessThan(idx('New'));
    expect(idx('New')).toBeLessThan(idx('Triage'));
    expect(idx('Triage')).toBeLessThan(idx('Explore'));
    expect(idx('Explore')).toBeLessThan(idx('Decide'));
    expect(idx('Decide')).toBeLessThan(idx('Map'));
    expect(idx('Map')).toBeLessThan(idx('Audit'));
    expect(idx('Audit')).toBeLessThan(idx('Status'));
    expect(idx('Status')).toBeLessThan(idx('Finalize'));
  });

  it('Free Terminal click dispatches skill:spawn with skill=free', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-free'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith<[SkillSpawnRequest]>({
      skill: 'free',
      nodes: [],
      cwd: '/my-project',
    });
  });

  it('New click dispatches skill:spawn with skill=new', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-new'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith<[SkillSpawnRequest]>({
      skill: 'new',
      nodes: [],
      cwd: '/my-project',
    });
  });

  it('Triage click dispatches skill:spawn with skill=triage and no nodes when nothing selected', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-triage'));
    await waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    expect(spawnMock).toHaveBeenCalledWith<[SkillSpawnRequest]>({
      skill: 'triage',
      nodes: [],
      cwd: '/my-project',
    });
  });

  it('Audit click calls runDetached with skill=audit', async () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-audit'));
    await waitFor(() => expect(runDetachedMock).toHaveBeenCalledOnce());
    expect(runDetachedMock).toHaveBeenCalledWith({ skill: 'audit', cwd: '/my-project' });
  });

  it('Audit button is enabled when terminal is active', () => {
    useAtriumStore.setState({ terminal: { id: 'term-1' as ReturnType<typeof useAtriumStore.getState>['terminal']['id'], status: 'active', fullscreen: false } });
    render(<Toolbar />);
    expect(screen.getByTestId('toolbar-btn-audit').getAttribute('disabled')).toBeNull();
  });

  it('Audit button shows Waiting… and is disabled when detachedRuns.audit.kind is waiting', () => {
    useAtriumStore.setState({
      detachedRuns: { audit: { kind: 'waiting', startedAt: 0 }, status: { kind: 'idle' } },
    });
    render(<Toolbar />);
    const auditBtn = screen.getByTestId('toolbar-btn-audit');
    expect(auditBtn.textContent).toBe('Waiting…');
    expect(auditBtn.getAttribute('disabled')).not.toBeNull();
  });

  it('lastDetachedError in store renders message in toolbar-error', () => {
    useAtriumStore.setState({ lastDetachedError: { skill: 'audit', message: 'audit pipeline failed' } });
    render(<Toolbar />);
    expect(screen.getByTestId('toolbar-error').textContent).toContain('audit pipeline failed');
  });

  it('clicking Audit while error is showing dispatches a fresh run', async () => {
    useAtriumStore.setState({
      detachedRuns: { audit: { kind: 'error', message: 'prior error', finishedAt: 0 }, status: { kind: 'idle' } },
      lastDetachedError: { skill: 'audit', message: 'prior error' },
    });
    render(<Toolbar />);
    expect(screen.getByTestId('toolbar-error').textContent).toContain('prior error');
    fireEvent.click(screen.getByTestId('toolbar-btn-audit'));
    await waitFor(() => expect(runDetachedMock).toHaveBeenCalledOnce());
    expect(runDetachedMock).toHaveBeenCalledWith({ skill: 'audit', cwd: '/my-project' });
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

  it('Status click sets toolbarOverlay to status without calling spawn', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-status'));
    expect(useAtriumStore.getState().toolbarOverlay).toBe('status');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('Finalize click sets toolbarOverlay to finalize without calling spawn', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-finalize'));
    expect(useAtriumStore.getState().toolbarOverlay).toBe('finalize');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('Free/New/Triage/Explore/Decide/Map/Finalize disabled when terminal active; Audit/Status remain enabled', () => {
    useAtriumStore.setState({ terminal: { id: 'term-1' as ReturnType<typeof useAtriumStore.getState>['terminal']['id'], status: 'active', fullscreen: false } });
    render(<Toolbar />);
    expect(screen.getByTestId('toolbar-btn-free').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-new').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-triage').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-explore').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-decide').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-map').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-audit').getAttribute('disabled')).toBeNull();
    expect(screen.getByTestId('toolbar-btn-finalize').getAttribute('disabled')).not.toBeNull();
    expect(screen.getByTestId('toolbar-btn-status').getAttribute('disabled')).toBeNull();
  });

  it('shows inline error when spawn fails', async () => {
    spawnMock.mockResolvedValue({ ok: false, error: { code: 'TERMINAL_BUSY', message: 'busy' } });
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    await waitFor(() => expect(screen.getByTestId('toolbar-error')).toBeDefined());
    expect(screen.getByTestId('toolbar-error').textContent).toContain('busy');
  });

  // --- Active-tab state ---

  it('clicking toolbar-btn-explore sets data-active=true on it and false on others', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    expect(screen.getByTestId('toolbar-btn-explore').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('toolbar-btn-free').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-new').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-triage').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-decide').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-map').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-audit').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-status').getAttribute('data-active')).toBe('false');
    expect(screen.getByTestId('toolbar-btn-finalize').getAttribute('data-active')).toBe('false');
  });

  it('clicking toolbar-btn-decide moves the active marker', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    fireEvent.click(screen.getByTestId('toolbar-btn-decide'));
    expect(screen.getByTestId('toolbar-btn-decide').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('toolbar-btn-explore').getAttribute('data-active')).toBe('false');
  });

  it('clicking toolbar-btn-status moves the active marker', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-explore'));
    fireEvent.click(screen.getByTestId('toolbar-btn-status'));
    expect(screen.getByTestId('toolbar-btn-status').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('toolbar-btn-explore').getAttribute('data-active')).toBe('false');
  });

  it('Status button data-active returns to false when toolbarOverlay is reset externally', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-status'));
    expect(screen.getByTestId('toolbar-btn-status').getAttribute('data-active')).toBe('true');
    act(() => { useAtriumStore.setState({ toolbarOverlay: null }); });
    expect(screen.getByTestId('toolbar-btn-status').getAttribute('data-active')).toBe('false');
  });

  it('Finalize button data-active returns to false when toolbarOverlay is reset externally', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByTestId('toolbar-btn-finalize'));
    expect(screen.getByTestId('toolbar-btn-finalize').getAttribute('data-active')).toBe('true');
    act(() => { useAtriumStore.setState({ toolbarOverlay: null }); });
    expect(screen.getByTestId('toolbar-btn-finalize').getAttribute('data-active')).toBe('false');
  });

  it('all tabs start with data-active=false', () => {
    render(<Toolbar />);
    const tabs = ['free', 'new', 'triage', 'explore', 'decide', 'map', 'audit', 'status', 'finalize'];
    for (const name of tabs) {
      expect(screen.getByTestId(`toolbar-btn-${name}`).getAttribute('data-active')).toBe('false');
    }
  });

  // --- Health dot ---

  it('health dot has data-health="healthy" when store claudeStatus is healthy', () => {
    useAtriumStore.setState({ claudeStatus: 'healthy' });
    render(<Toolbar />);
    const dot = screen.getByTestId('toolbar-health-dot');
    expect(dot.getAttribute('data-health')).toBe('healthy');
    expect(dot.style.background).toBe('rgb(59, 165, 93)');
  });

  it('health dot has data-health="unreachable" when store claudeStatus is unreachable', () => {
    useAtriumStore.setState({ claudeStatus: 'unreachable' });
    render(<Toolbar />);
    const dot = screen.getByTestId('toolbar-health-dot');
    expect(dot.getAttribute('data-health')).toBe('unreachable');
    expect(dot.style.background).toBe('rgb(226, 75, 74)');
  });

  it('health dot has data-health="checking" when store claudeStatus is checking', () => {
    useAtriumStore.setState({ claudeStatus: 'checking' });
    render(<Toolbar />);
    const dot = screen.getByTestId('toolbar-health-dot');
    expect(dot.getAttribute('data-health')).toBe('checking');
    expect(dot.style.background).toBe('rgb(106, 106, 114)');
  });

  // --- Project name ---

  it('project name span reflects project.projectName', () => {
    render(<Toolbar />);
    expect(screen.getByText('My Project')).toBeDefined();
  });

  it('project name span renders empty when project is null', () => {
    useAtriumStore.setState({ project: null });
    render(<Toolbar />);
    const toolbar = screen.getByTestId('toolbar');
    const spans = toolbar.querySelectorAll('span');
    const nameSpan = Array.from(spans).find(
      (s) => s.style.color === 'rgb(106, 106, 114)' || s.style.color === '#6a6a72',
    );
    expect(nameSpan?.textContent).toBe('');
  });
});
