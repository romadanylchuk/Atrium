import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToastStore } from '../toastStore';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toastStore', () => {
  it('pushToast adds a toast with the given message and kind', () => {
    useToastStore.getState().pushToast('Something failed', 'error');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    const toast = toasts[0]!;
    expect(toast.message).toBe('Something failed');
    expect(toast.kind).toBe('error');
  });

  it('pushToast defaults kind to error', () => {
    useToastStore.getState().pushToast('oops');
    expect(useToastStore.getState().toasts[0]!.kind).toBe('error');
  });

  it('pushToast returns the toast id', () => {
    const id = useToastStore.getState().pushToast('hello', 'info');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('multiple toasts stack', () => {
    useToastStore.getState().pushToast('a', 'error');
    useToastStore.getState().pushToast('b', 'info');
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });

  it('dismissToast removes the specified toast', () => {
    const id = useToastStore.getState().pushToast('remove me', 'error');
    useToastStore.getState().pushToast('keep me', 'info');
    useToastStore.getState().dismissToast(id);
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toBe('keep me');
  });

  it('toast auto-dismisses after 4 seconds', () => {
    useToastStore.getState().pushToast('auto', 'error');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('toast does not auto-dismiss before 4 seconds', () => {
    useToastStore.getState().pushToast('still here', 'error');
    vi.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it('dismissing before auto-dismiss does not cause errors at 4s', () => {
    const id = useToastStore.getState().pushToast('early dismiss', 'error');
    useToastStore.getState().dismissToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
