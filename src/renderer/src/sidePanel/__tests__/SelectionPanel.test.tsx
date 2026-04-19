import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { SelectionPanel } from '../SelectionPanel';
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
      maturity: 'decided',
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

beforeEach(() => {
  useAtriumStore.setState({
    project: fakeProject,
    selectedNodes: new Set(['canvas-ui', 'cli-engine']),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SelectionPanel', () => {
  it('renders selected node names resolved from slugs', () => {
    render(<SelectionPanel />);
    expect(screen.getByText('Canvas UI')).toBeDefined();
    expect(screen.getByText('CLI Engine')).toBeDefined();
  });

  it('falls back to slug if node not found', () => {
    useAtriumStore.setState({ selectedNodes: new Set(['unknown-slug']) });
    render(<SelectionPanel />);
    expect(screen.getByText('unknown-slug')).toBeDefined();
  });

  it('renders empty state message when nothing selected', () => {
    useAtriumStore.setState({ selectedNodes: new Set() });
    render(<SelectionPanel />);
    expect(screen.getByText('No nodes selected.')).toBeDefined();
  });

  it('Clear button calls clearSelection', () => {
    const clearSelection = vi.fn();
    useAtriumStore.setState({ clearSelection } as never);
    render(<SelectionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(clearSelection).toHaveBeenCalledOnce();
  });
});
