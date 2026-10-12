import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UpdateStatus } from '@shared/update';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { UpdatePrompt } from '../UpdatePrompt';

let push: (s: UpdateStatus) => void = () => {};
const api = {
  getStatus: vi.fn(),
  download: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  openReleasePage: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  onStatus: vi.fn((cb: (s: UpdateStatus) => void) => {
    push = cb;
    return () => {};
  }),
};

const available = (over: Partial<Extract<UpdateStatus, { kind: 'available' }>> = {}): UpdateStatus => ({
  kind: 'available',
  version: '0.1.4',
  currentVersion: '0.1.3',
  canAutoInstall: true,
  releaseUrl: 'https://github.com/romadanylchuk/Atrium/releases/tag/v0.1.4',
  ...over,
});

async function renderWith(initial: UpdateStatus) {
  api.getStatus.mockResolvedValue({ ok: true, data: initial });
  render(<UpdatePrompt />);
  await act(async () => {});
}

beforeEach(() => {
  vi.stubGlobal('atrium', { update: api });
  useAtriumStore.setState((s) => ({ terminal: { ...s.terminal, status: 'idle' } }));
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('UpdatePrompt', () => {
  it('renders nothing while idle', async () => {
    await renderWith({ kind: 'idle' });
    expect(screen.queryByTestId('update-prompt')).toBeNull();
  });

  it('offers to install when an update is available', async () => {
    await renderWith(available());
    expect(screen.getByTestId('update-prompt').textContent).toContain('0.1.4');
    fireEvent.click(screen.getByText('Install and restart'));
    expect(api.download).toHaveBeenCalledOnce();
  });

  it('shows a Download button where self-update is unsupported', async () => {
    await renderWith(available({ canAutoInstall: false }));
    expect(screen.getByText('Download')).toBeTruthy();
    expect(screen.queryByText('Install and restart')).toBeNull();
  });

  it('warns that restarting ends a running terminal', async () => {
    useAtriumStore.setState((s) => ({ terminal: { ...s.terminal, status: 'active' } }));
    await renderWith(available());
    expect(screen.getByText(/end the running terminal session/)).toBeTruthy();
  });

  it('"Later" hides the offer for that version only', async () => {
    await renderWith(available());
    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByTestId('update-prompt')).toBeNull();
    act(() => push(available()));
    expect(screen.queryByTestId('update-prompt')).toBeNull();
    act(() => push(available({ version: '0.1.5' })));
    expect(screen.getByTestId('update-prompt')).toBeTruthy();
  });

  it('shows download progress pushed from main', async () => {
    await renderWith(available());
    act(() => push({ kind: 'downloading', version: '0.1.4', percent: 37.6 }));
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('38');
  });

  it('on error offers the download page', async () => {
    await renderWith({ kind: 'error', message: 'boom', releaseUrl: null });
    fireEvent.click(screen.getByText('Open download page'));
    expect(api.openReleasePage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('update-prompt')).toBeNull();
  });
});
