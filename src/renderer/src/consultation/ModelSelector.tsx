import type { JSX } from 'react';
import { useAtriumStore } from '@renderer/store/atriumStore';
import { CONSULTATION_MODELS } from '@shared/index';
import { NewSessionButton } from './NewSessionButton';

export function ModelSelector(): JSX.Element {
  const thread = useAtriumStore((s) => s.consultation.thread);
  const selectedModel = useAtriumStore((s) => s.consultation.selectedModel);
  const setModel = useAtriumStore((s) => s.setConsultationModel);

  if (thread !== null) {
    return (
      <div
        data-testid="consultation-model-selector"
        data-mode="readonly"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span
          data-testid="consultation-current-model"
          style={{ fontSize: 11, color: '#8a8a92', textTransform: 'capitalize' }}
        >
          {thread.model}
        </span>
        <NewSessionButton />
      </div>
    );
  }

  return (
    <div
      data-testid="consultation-model-selector"
      data-mode="editable"
      role="radiogroup"
      aria-label="Model"
      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
    >
      {CONSULTATION_MODELS.map((m) => (
        <label
          key={m}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: selectedModel === m ? '#e6e6e6' : '#8a8a92',
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          <input
            type="radio"
            name="consultation-model"
            value={m}
            checked={selectedModel === m}
            onChange={() => setModel(m)}
            data-testid={`consultation-model-radio-${m}`}
            style={{ margin: 0 }}
          />
          {m}
        </label>
      ))}
    </div>
  );
}
