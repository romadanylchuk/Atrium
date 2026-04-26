import type { Result } from '@shared/result';
import { err } from '@shared/result';
import type { SkillErrorCode } from '@shared/errors';
import type { DetachedSkillName, DetachedRunResult } from '@shared/skill/detached';
import { useAtriumStore } from '../store/atriumStore';

export async function dispatchDetachedSkill(req: {
  skill: DetachedSkillName;
  cwd: string;
}): Promise<Result<DetachedRunResult, SkillErrorCode | 'BUSY'>> {
  const start = useAtriumStore.getState().startDetachedRun(req.skill);
  if (!start.ok) return start;

  let r: Result<DetachedRunResult, SkillErrorCode>;
  try {
    r = await window.atrium.skill.runDetached(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    useAtriumStore.getState().setDetachedRunError(req.skill, message);
    return err('INTERNAL', message);
  }
  if (r.ok) {
    useAtriumStore.getState().setDetachedRunResult(req.skill, r.data.stdout);
  } else {
    useAtriumStore.getState().setDetachedRunError(req.skill, r.error.message);
  }
  return r;
}
