import type { JSX } from 'react';
import type { SkillName } from '@shared/skill/spawn';
import { dispatchSkill } from '../skill/dispatchSkill';

type Props = {
  skill: SkillName;
  label: string;
  nodes: string[];
  cwd: string;
  disabled?: boolean;
  onSuccess: () => void;
  onError: (error: { code: string; message: string }) => void;
};

export function SkillButton({ skill, label, nodes, cwd, disabled, onSuccess, onError }: Props): JSX.Element {
  async function handleClick() {
    const result = await dispatchSkill({ skill, nodes, cwd });
    if (result.ok) {
      onSuccess();
    } else {
      onError(result.error);
    }
  }

  return (
    <button
      data-skill={skill}
      disabled={disabled}
      onClick={() => void handleClick()}
      style={{
        padding: '4px 10px',
        fontSize: '12px',
        borderRadius: '4px',
        border: '1px solid rgba(255,255,255,0.3)',
        background: 'rgba(255,255,255,0.1)',
        color: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
