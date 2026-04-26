import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { StatusPanel } from '../StatusPanel';
import type { ProjectState } from '@shared/domain';

const fakeProject: ProjectState = {
  rootPath: '/proj',
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
    {
      slug: 'parser',
      name: 'Parser',
      priority: 'core',
      maturity: 'decided',
      file: 'ideas/parser.md',
      summary: '',
      description: '',
      sections: {},
    },
  ],
  connections: [{ from: 'cli-engine', to: 'canvas-ui', type: 'dependency' }],
  sessions: [],
  warnings: [],
};

const runDetachedMock = vi.fn();

beforeEach(() => {
  runDetachedMock.mockReset();
  runDetachedMock.mockResolvedValue({ ok: true, data: { exitCode: 0, stdout: '' } });

  vi.stubGlobal('atrium', {
    skill: { runDetached: runDetachedMock },
  });

  useAtriumStore.setState({
    detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'idle' } },
    lastDetachedError: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('StatusPanel', () => {
  it('renders the project name', () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    expect(screen.getByText('My Project')).toBeDefined();
  });

  it('groups nodes by maturity with counts', () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    expect(screen.getByText('decided (2)')).toBeDefined();
    expect(screen.getByText('ready (1)')).toBeDefined();
  });

  it('lists node names inside each maturity group', () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    expect(screen.getByText('Canvas UI')).toBeDefined();
    expect(screen.getByText('CLI Engine')).toBeDefined();
    expect(screen.getByText('Parser')).toBeDefined();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<StatusPanel project={fakeProject} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('status-panel-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders node and connection summary counts', () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    expect(screen.getByText(/3 nodes/)).toBeDefined();
    expect(screen.getByText(/1 connection/)).toBeDefined();
  });

  it('handles empty project gracefully', () => {
    const emptyProject: ProjectState = { ...fakeProject, nodes: [], connections: [] };
    render(<StatusPanel project={emptyProject} onClose={() => {}} />);
    expect(screen.getByText('No nodes in this project.')).toBeDefined();
  });

  it('overlay wrapper has position absolute and inset 0 (canvas-bounded)', () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    const panel = screen.getByTestId('status-panel');
    expect(panel.style.position).toBe('absolute');
    expect(panel.style.position).not.toBe('fixed');
    expect(panel.style.inset).toBe('0px');
  });

  it('More Status button is present', () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    expect(screen.getByTestId('status-panel-more')).toBeDefined();
    expect(screen.getByTestId('status-panel-more').textContent).toBe('More Status');
  });

  it('More Status click dispatches runDetached with skill=status', async () => {
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('status-panel-more'));
    await waitFor(() => expect(runDetachedMock).toHaveBeenCalledOnce());
    expect(runDetachedMock).toHaveBeenCalledWith({ skill: 'status', cwd: '/proj' });
  });

  it('More Status button shows Waiting… and is disabled when detachedRuns.status.kind is waiting', () => {
    useAtriumStore.setState({
      detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'waiting', startedAt: 0 } },
    });
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    const btn = screen.getByTestId('status-panel-more');
    expect(btn.textContent).toBe('Waiting…');
    expect(btn.getAttribute('disabled')).not.toBeNull();
  });

  it('More Status re-click while error showing clears prior error', () => {
    useAtriumStore.setState({
      detachedRuns: { audit: { kind: 'idle' }, status: { kind: 'error', message: 'prior error', finishedAt: 0 } },
      lastDetachedError: { skill: 'status', message: 'prior error' },
    });
    render(<StatusPanel project={fakeProject} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('status-panel-more'));
    expect(useAtriumStore.getState().lastDetachedError).toBeNull();
  });
});
