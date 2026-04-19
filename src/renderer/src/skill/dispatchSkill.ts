import type { SkillSpawnRequest } from '@shared/skill/spawn';
import type { SkillErrorCode } from '@shared/errors';
import type { Result } from '@shared/result';
import { err } from '@shared/result';
import type { TerminalId } from '@shared/domain';
import { useAtriumStore } from '../store/atriumStore';

export async function dispatchSkill(req: SkillSpawnRequest): Promise<Result<TerminalId, SkillErrorCode>> {
  const result = await window.atrium.skill.spawn(req);
  if (result.ok) {
    const r = useAtriumStore.getState().setTerminal({ status: 'spawning', id: result.data });
    if (!r.ok) {
      return err('INTERNAL' as SkillErrorCode, r.error.message);
    }
  }
  return result;
}
