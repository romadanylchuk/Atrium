import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RecentsList } from '../RecentsList';
import type { RecentProject } from '@shared/domain';

afterEach(cleanup);

const makeRecent = (path: string, name: string): RecentProject => ({
  path,
  name,
  lastOpened: new Date().toISOString(),
});

describe('RecentsList', () => {
  it('shows placeholder when list is empty', () => {
    render(<RecentsList recents={[]} onPick={vi.fn()} />);
    expect(screen.getByText('No recent projects.')).toBeTruthy();
  });

  it('renders 3 buttons when 3 recents provided', () => {
    const recents = [
      makeRecent('/a', 'Alpha'),
      makeRecent('/b', 'Beta'),
      makeRecent('/c', 'Gamma'),
    ];
    render(<RecentsList recents={recents} onPick={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('calls onPick with the correct path when a button is clicked', async () => {
    const onPick = vi.fn();
    const recents = [makeRecent('/a', 'Alpha'), makeRecent('/b', 'Beta')];
    render(<RecentsList recents={recents} onPick={onPick} />);
    await userEvent.click(screen.getByText('Beta'));
    expect(onPick).toHaveBeenCalledWith('/b');
  });

  it('disables the button for the current path', () => {
    const recents = [makeRecent('/a', 'Alpha'), makeRecent('/b', 'Beta')];
    render(<RecentsList recents={recents} onPick={vi.fn()} currentPath="/a" />);
    const buttons = screen.getAllByRole('button');
    const alphaBtn = buttons.find((b) => b.textContent === 'Alpha')!;
    const betaBtn = buttons.find((b) => b.textContent === 'Beta')!;
    expect((alphaBtn as HTMLButtonElement).disabled).toBe(true);
    expect((betaBtn as HTMLButtonElement).disabled).toBe(false);
  });
});
