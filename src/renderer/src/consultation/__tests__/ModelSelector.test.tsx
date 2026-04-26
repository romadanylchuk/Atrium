import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import type { ConsultationThread } from '@shared/index';
import { ModelSelector } from '../ModelSelector';

const defaultConsultation = () => ({
  panel: { kind: 'closed' as const },
  pinState: false,
  thread: null,
  pending: null,
  inFlight: null,
  lastError: null,
  selectedModel: 'sonnet' as const,
});

function makeThread(model: 'opus' | 'sonnet' = 'sonnet'): ConsultationThread {
  return {
    sessionId: 'sess-1',
    createdAt: 0,
    lastActiveAt: 0,
    model,
    systemPromptVersion: 1,
    messages: [],
  };
}

beforeEach(() => {
  useAtriumStore.setState({ consultation: defaultConsultation() });
});

afterEach(() => {
  cleanup();
});

describe('ModelSelector', () => {
  it('renders editable radios when thread === null', () => {
    render(<ModelSelector />);
    const root = screen.getByTestId('consultation-model-selector');
    expect(root.dataset.mode).toBe('editable');
    expect(screen.getByTestId('consultation-model-radio-sonnet')).toBeTruthy();
    expect(screen.getByTestId('consultation-model-radio-opus')).toBeTruthy();
  });

  it('reflects the currently selected model in the radios', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), selectedModel: 'opus' },
    });
    render(<ModelSelector />);
    const opus = screen.getByTestId<HTMLInputElement>('consultation-model-radio-opus');
    const sonnet = screen.getByTestId<HTMLInputElement>('consultation-model-radio-sonnet');
    expect(opus.checked).toBe(true);
    expect(sonnet.checked).toBe(false);
  });

  it('updates selectedModel on radio change', () => {
    render(<ModelSelector />);
    const opus = screen.getByTestId<HTMLInputElement>('consultation-model-radio-opus');
    fireEvent.click(opus);
    expect(useAtriumStore.getState().consultation.selectedModel).toBe('opus');
  });

  it('renders readonly current model + NewSessionButton when thread !== null', () => {
    useAtriumStore.setState({
      consultation: {
        ...defaultConsultation(),
        thread: makeThread('opus'),
        selectedModel: 'opus',
      },
    });
    render(<ModelSelector />);
    const root = screen.getByTestId('consultation-model-selector');
    expect(root.dataset.mode).toBe('readonly');
    expect(screen.getByTestId('consultation-current-model').textContent).toBe('opus');
    expect(screen.getByTestId('consultation-new-session-button')).toBeTruthy();
  });

  it('readonly mode does not render radios', () => {
    useAtriumStore.setState({
      consultation: { ...defaultConsultation(), thread: makeThread('sonnet') },
    });
    render(<ModelSelector />);
    expect(screen.queryByTestId('consultation-model-radio-sonnet')).toBeNull();
    expect(screen.queryByTestId('consultation-model-radio-opus')).toBeNull();
  });
});
