import { describe, it, expect, vi } from 'vitest';
import { openOrNewProject } from '../openOrNewProject';
import type { ProjectState } from '@shared/domain';
import { ok, err } from '@shared/result';

const fakeState: ProjectState = {
  rootPath: '/fake',
  projectName: 'Fake',
  projectHash: 'abc',
  context: { description: '', sections: {} },
  nodes: [],
  connections: [],
  sessions: [],
  warnings: [],
};

describe('openOrNewProject', () => {
  it('returns opened when project.open succeeds', async () => {
    const openFn = vi.fn().mockResolvedValue(ok(fakeState));
    const result = await openOrNewProject('/some/path', openFn);
    expect(result.kind).toBe('opened');
    if (result.kind === 'opened') expect(result.state).toEqual(fakeState);
  });

  it('returns new when project.open returns NOT_AN_ARCH_PROJECT', async () => {
    const openFn = vi.fn().mockResolvedValue(err('NOT_AN_ARCH_PROJECT', 'Not an arch project'));
    const result = await openOrNewProject('/some/path', openFn);
    expect(result.kind).toBe('new');
    if (result.kind === 'new') expect(result.cwd).toBe('/some/path');
  });

  it('returns error when project.open returns another error', async () => {
    const openFn = vi.fn().mockResolvedValue(err('PATH_NOT_FOUND', 'Path not found'));
    const result = await openOrNewProject('/some/path', openFn);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toBe('Path not found');
  });

  it('returns error when openFn throws unexpectedly', async () => {
    const openFn = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await openOrNewProject('/some/path', openFn);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toBe('boom');
  });
});
