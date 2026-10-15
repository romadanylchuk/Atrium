import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

function Bomb(): never {
  throw new Error('render exploded');
}

const openLogsFolder = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.stubGlobal('atrium', { shell: { openLogsFolder } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeTruthy();
    expect(screen.queryByTestId('error-boundary')).toBeNull();
  });

  it('shows the error instead of a blank window and logs it', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByTestId('error-boundary').textContent).toContain('render exploded');
    const logged = vi.mocked(console.error).mock.calls.some((c) => String(c[0]).includes('[atrium:render]'));
    expect(logged).toBe(true);
  });

  it('opens the logs folder', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    fireEvent.click(screen.getByText('Open logs folder'));
    expect(openLogsFolder).toHaveBeenCalledOnce();
  });
});
