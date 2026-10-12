import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReactFlowProvider } from 'reactflow';
import { useAtriumStore } from '../../store/atriumStore';
import { NodeSearch } from '../NodeSearch';
import type { ProjectState } from '@shared/domain';

const node = (slug: string, name: string) => ({
  slug, name, maturity: 'ready', priority: 'core', file: `ideas/${slug}.md`, summary: '', description: '', sections: {},
});

const project = {
  rootPath: '/tmp/p', projectName: 'P', projectHash: 'h', context: { description: '', sections: {} },
  nodes: [node('canvas-ui', 'Canvas UI'), node('cli-engine', 'CLI Engine'), node('data-layer', 'Data Layer')],
  connections: [], sessions: [], warnings: [],
} as unknown as ProjectState;

function renderSearch() {
  render(<ReactFlowProvider><NodeSearch /></ReactFlowProvider>);
  return screen.getByRole('combobox');
}

describe('NodeSearch', () => {
  beforeEach(() => useAtriumStore.setState({ project, legendHighlight: null }));
  afterEach(cleanup);

  it('renders nothing without nodes', () => {
    useAtriumStore.setState({ project: null });
    render(<ReactFlowProvider><NodeSearch /></ReactFlowProvider>);
    expect(screen.queryByTestId('node-search')).toBeNull();
  });

  it('suggests matching names as the user types', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'c' } });
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toContain('Canvas UI');
    expect(options[1]).toContain('CLI Engine');
    expect(options.join()).not.toContain('Data Layer');
  });

  it('shows an empty state when nothing matches', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No matching nodes')).toBeTruthy();
  });

  it('clicking a suggestion highlights that node', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'data' } });
    fireEvent.mouseDown(screen.getByTestId('node-search-option-data-layer'));
    expect(useAtriumStore.getState().legendHighlight).toEqual({ kind: 'node', value: 'data-layer' });
    expect((input as HTMLInputElement).value).toBe('Data Layer');
  });

  it('keyboard: ArrowDown + Enter selects the second suggestion', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'c' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useAtriumStore.getState().legendHighlight).toEqual({ kind: 'node', value: 'cli-engine' });
  });

  it('clear button resets text and highlight', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'data' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.mouseDown(screen.getByTestId('node-search-clear'));
    expect((input as HTMLInputElement).value).toBe('');
    expect(useAtriumStore.getState().legendHighlight).toBeNull();
  });

  it('a legend highlight replacing the search clears the box', () => {
    const input = renderSearch();
    fireEvent.change(input, { target: { value: 'data' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Data Layer' } });
    // simulate a legend click
    act(() => useAtriumStore.getState().setLegendHighlight({ kind: 'maturity', value: 'ready' }));
    expect(screen.getByRole<HTMLInputElement>('combobox').value).toBe('');
  });
});
