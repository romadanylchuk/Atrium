import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { FinalizePanel } from '../FinalizePanel';
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
  ],
  connections: [],
  sessions: [],
  warnings: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FinalizePanel', () => {
  it('renders the project name in the heading', () => {
    render(<FinalizePanel project={fakeProject} canContinue onContinue={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/My Project/)).toBeDefined();
  });

  it('calls onContinue when Continue button clicked', () => {
    const onContinue = vi.fn();
    render(<FinalizePanel project={fakeProject} canContinue onContinue={onContinue} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('finalize-panel-continue'));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<FinalizePanel project={fakeProject} canContinue onContinue={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('finalize-panel-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables Continue button when canContinue is false', () => {
    render(<FinalizePanel project={fakeProject} canContinue={false} onContinue={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('finalize-panel-continue').getAttribute('disabled')).not.toBeNull();
  });

  it('enables Continue button when canContinue is true', () => {
    render(<FinalizePanel project={fakeProject} canContinue onContinue={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('finalize-panel-continue').getAttribute('disabled')).toBeNull();
  });

  it('overlay wrapper has position absolute and inset 0 (canvas-bounded)', () => {
    render(<FinalizePanel project={fakeProject} canContinue onContinue={() => {}} onClose={() => {}} />);
    const panel = screen.getByTestId('finalize-panel');
    expect(panel.style.position).toBe('absolute');
    expect(panel.style.position).not.toBe('fixed');
    expect(panel.style.inset).toBe('0px');
  });
});
