import { describe, it, expect } from 'vitest';
import { composeCommand } from '../composeCommand.js';

const dir = '/home/user/.claude/skills';

describe('composeCommand', () => {
  it('init with prompt', () => {
    expect(composeCommand({ skill: 'init', prompt: 'my project', skillsDir: dir })).toEqual([
      'claude',
      '/architector:init my project',
      '--append-system-prompt-file',
      `${dir}/init.md`,
    ]);
  });

  it('init without prompt degrades gracefully', () => {
    expect(composeCommand({ skill: 'init', skillsDir: dir })).toEqual([
      'claude',
      '/architector:init',
      '--append-system-prompt-file',
      `${dir}/init.md`,
    ]);
  });

  it('explore with one node', () => {
    expect(composeCommand({ skill: 'explore', nodes: ['auth-node'], skillsDir: dir })).toEqual([
      'claude',
      '/architector:explore auth-node',
      '--append-system-prompt-file',
      `${dir}/explore.md`,
    ]);
  });

  it('explore with empty nodes degrades to no-slug form', () => {
    expect(composeCommand({ skill: 'explore', nodes: [], skillsDir: dir })).toEqual([
      'claude',
      '/architector:explore',
      '--append-system-prompt-file',
      `${dir}/explore.md`,
    ]);
  });

  it('decide with one node', () => {
    expect(composeCommand({ skill: 'decide', nodes: ['storage'], skillsDir: dir })).toEqual([
      'claude',
      '/architector:decide storage',
      '--append-system-prompt-file',
      `${dir}/decide.md`,
    ]);
  });

  it('map with multiple nodes', () => {
    expect(composeCommand({ skill: 'map', nodes: ['a', 'b', 'c'], skillsDir: dir })).toEqual([
      'claude',
      '/architector:map a b c',
      '--append-system-prompt-file',
      `${dir}/map.md`,
    ]);
  });

  it('map with single node', () => {
    expect(composeCommand({ skill: 'map', nodes: ['only'], skillsDir: dir })).toEqual([
      'claude',
      '/architector:map only',
      '--append-system-prompt-file',
      `${dir}/map.md`,
    ]);
  });

  it('map with zero nodes degrades to no-slugs form', () => {
    // not a valid invocation but function must not throw
    expect(composeCommand({ skill: 'map', nodes: [], skillsDir: dir })).toEqual([
      'claude',
      '/architector:map',
      '--append-system-prompt-file',
      `${dir}/map.md`,
    ]);
  });

  it('finalize with multiple nodes', () => {
    expect(composeCommand({ skill: 'finalize', nodes: ['x', 'y'], skillsDir: dir })).toEqual([
      'claude',
      '/architector:finalize x y',
      '--append-system-prompt-file',
      `${dir}/finalize.md`,
    ]);
  });

  it('free returns only claude', () => {
    expect(composeCommand({ skill: 'free', skillsDir: dir })).toEqual(['claude']);
  });

  it('skillsDir with trailing slash produces no double-slash', () => {
    const result = composeCommand({ skill: 'init', prompt: 'test', skillsDir: `${dir}/` });
    expect(result[3]).toBe(`${dir}/init.md`);
    expect(result[3]).not.toContain('//');
  });
});
