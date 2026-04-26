import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { usePanelState } from '../hooks/usePanelState';

const defaultConsultation = () => ({
  panel: { kind: 'closed' as const },
  pinState: false,
  thread: null,
  pending: null,
  inFlight: null,
  lastError: null,
  selectedModel: 'sonnet' as const,
});

beforeEach(() => {
  useAtriumStore.setState({ consultation: defaultConsultation() });
});

afterEach(() => {
  cleanup();
});

describe('usePanelState', () => {
  it('reports closed state with isOpen=false and isPinned=false by default', () => {
    const { result } = renderHook(() => usePanelState());
    expect(result.current.state).toEqual({ kind: 'closed' });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isPinned).toBe(false);
  });

  it('reports isOpen=true for open-unpinned', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-unpinned' } },
    });
    const { result } = renderHook(() => usePanelState());
    expect(result.current.state).toEqual({ kind: 'open-unpinned' });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isPinned).toBe(false);
  });

  it('reports isOpen=true and isPinned=true for open-pinned', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-pinned' }, pinState: true },
    });
    const { result } = renderHook(() => usePanelState());
    expect(result.current.state).toEqual({ kind: 'open-pinned' });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isPinned).toBe(true);
  });

  it('reports isOpen=true for preview', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'preview' } },
    });
    const { result } = renderHook(() => usePanelState());
    expect(result.current.state).toEqual({ kind: 'preview' });
    expect(result.current.isOpen).toBe(true);
  });

  it('open() dispatches to openConsultationPanel — opens unpinned when pinState=false', () => {
    const { result } = renderHook(() => usePanelState());
    act(() => {
      result.current.open();
    });
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-unpinned' });
  });

  it('open() dispatches to openConsultationPanel — opens pinned when pinState=true', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), pinState: true },
    });
    const { result } = renderHook(() => usePanelState());
    act(() => {
      result.current.open();
    });
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'open-pinned' });
  });

  it('close() dispatches to closeConsultationPanel', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-unpinned' } },
    });
    const { result } = renderHook(() => usePanelState());
    act(() => {
      result.current.close();
    });
    expect(useAtriumStore.getState().consultation.panel).toEqual({ kind: 'closed' });
  });

  it('togglePin() flips pinState and promotes open-unpinned → open-pinned', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-unpinned' } },
    });
    const { result } = renderHook(() => usePanelState());
    act(() => {
      result.current.togglePin();
    });
    const c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(true);
    expect(c.panel).toEqual({ kind: 'open-pinned' });
  });

  it('togglePin() promotes preview → open-pinned', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'preview' } },
    });
    const { result } = renderHook(() => usePanelState());
    act(() => {
      result.current.togglePin();
    });
    const c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(true);
    expect(c.panel).toEqual({ kind: 'open-pinned' });
  });

  it('togglePin() demotes open-pinned → open-unpinned', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), panel: { kind: 'open-pinned' }, pinState: true },
    });
    const { result } = renderHook(() => usePanelState());
    act(() => {
      result.current.togglePin();
    });
    const c = useAtriumStore.getState().consultation;
    expect(c.pinState).toBe(false);
    expect(c.panel).toEqual({ kind: 'open-unpinned' });
  });

  it('reflects external store updates between renders', () => {
    const { result, rerender } = renderHook(() => usePanelState());
    expect(result.current.isOpen).toBe(false);

    act(() => {
      useAtriumStore.setState({
        consultation: { ...defaultConsultation(), panel: { kind: 'open-pinned' }, pinState: true },
      });
    });
    rerender();

    expect(result.current.isOpen).toBe(true);
    expect(result.current.isPinned).toBe(true);
    expect(result.current.state).toEqual({ kind: 'open-pinned' });
  });
});
