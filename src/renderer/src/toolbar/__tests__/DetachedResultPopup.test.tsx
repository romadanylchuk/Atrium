import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DetachedResultPopup } from '../DetachedResultPopup';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DetachedResultPopup', () => {
  it('renders supplied output verbatim including special characters', () => {
    const onClose = vi.fn();
    const rawOutput = '** bold * star\nline two';
    const { container } = render(
      <DetachedResultPopup
        title="Audit"
        output={rawOutput}
        onClose={onClose}
        testid="audit-result-popup"
      />,
    );
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe(rawOutput);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <DetachedResultPopup
        title="Status"
        output="some output"
        onClose={onClose}
        testid="status-result-popup"
      />,
    );
    fireEvent.click(screen.getByTestId('status-result-popup-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders without crashing on empty output and Close is still present', () => {
    const onClose = vi.fn();
    render(
      <DetachedResultPopup
        title="Audit"
        output=""
        onClose={onClose}
        testid="audit-result-popup"
      />,
    );
    const closeBtn = screen.getByTestId('audit-result-popup-close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the supplied testid for the root element', () => {
    const onClose = vi.fn();
    render(
      <DetachedResultPopup
        title="Status"
        output="hello"
        onClose={onClose}
        testid="status-result-popup"
      />,
    );
    expect(screen.getByText('Status Output')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('overlay has position absolute not fixed', () => {
    const onClose = vi.fn();
    render(
      <DetachedResultPopup
        title="Audit"
        output="text"
        onClose={onClose}
        testid="audit-result-popup"
      />,
    );
    const el = screen.getByTestId('audit-result-popup');
    expect((el as HTMLElement).style.position).toBe('absolute');
  });
});
