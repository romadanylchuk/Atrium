import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { SidePanel } from '../SidePanel';
import type { ProjectState } from '@shared/domain';

const fakeProject: ProjectState = {
  rootPath: '/proj',
  projectName: 'Proj',
  projectHash: 'h',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
};

beforeEach(() => {
  vi.stubGlobal('atrium', {
    project: {
      getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      open: vi.fn(),
      switch: vi.fn(),
    },
    dialog: { openFolder: vi.fn() },
    skill: { spawn: vi.fn() },
  });
  useAtriumStore.setState({
    project: fakeProject,
    activePanel: 'project',
    selectedNodes: new Set(),
    terminal: { id: null, status: 'idle', fullscreen: false },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SidePanel', () => {
  it('renders ProjectPanel when activePanel is project', () => {
    render(<SidePanel />);
    expect(screen.getByTestId('project-panel')).toBeDefined();
    expect(screen.queryByTestId('selection-panel')).toBeNull();
  });

  it('renders SelectionPanel when activePanel is selection', () => {
    useAtriumStore.setState({ activePanel: 'selection' });
    render(<SidePanel />);
    expect(screen.getByTestId('selection-panel')).toBeDefined();
    expect(screen.queryByTestId('project-panel')).toBeNull();
  });
});
