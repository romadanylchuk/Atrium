import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MainShell } from '../MainShell';

vi.stubGlobal('atrium', {
  layout: {
    load: vi.fn().mockResolvedValue({ ok: true, data: null }),
    save: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    saveSnapshot: vi.fn(),
  },
  fileSync: {
    onChanged: vi.fn().mockReturnValue(() => {}),
  },
  project: {
    getRecents: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    open: vi.fn(),
  },
});

describe('MainShell', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the side-panel placeholder', () => {
    const { container } = render(<MainShell />);
    const aside = container.querySelector('[data-region="side-panel"]');
    expect(aside).toBeTruthy();
  });

  it('renders the toolbar slot', () => {
    const { container } = render(<MainShell />);
    const toolbar = container.querySelector('[data-region="toolbar"]');
    expect(toolbar).toBeTruthy();
  });
});
