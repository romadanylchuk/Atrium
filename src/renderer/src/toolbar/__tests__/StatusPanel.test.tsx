import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
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
  connections: [{ from: 'cli-engine', to: 'canvas-ui', type: 'depends-on' }],
  sessions: [],
  warnings: [],
};

afterEach(() => {
  cleanup();
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
});
