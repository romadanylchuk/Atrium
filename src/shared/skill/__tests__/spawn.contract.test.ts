import { describe, it, expectTypeOf } from 'vitest';
import type { SkillSpawnRequest, SkillName } from '../spawn.js';

describe('SkillSpawnRequest contract', () => {
  it('accepts a valid request with all fields', () => {
    const req: SkillSpawnRequest = {
      skill: 'explore',
      nodes: ['canvas-ui'],
      prompt: 'What is this node about?',
      cwd: '/home/user/project',
    };
    expectTypeOf(req).toMatchTypeOf<SkillSpawnRequest>();
  });

  it('accepts a request without optional fields', () => {
    const req: SkillSpawnRequest = {
      skill: 'init',
      cwd: '/home/user/project',
    };
    expectTypeOf(req).toMatchTypeOf<SkillSpawnRequest>();
  });

  it('requires cwd — missing cwd is a type error', () => {
    // @ts-expect-error — cwd is required
    const req: SkillSpawnRequest = { skill: 'explore' };
    void req;
  });

  it('SkillName includes all expected values', () => {
    const names: SkillName[] = ['init', 'explore', 'decide', 'map', 'finalize', 'free'];
    expectTypeOf(names).toMatchTypeOf<SkillName[]>();
  });
});
