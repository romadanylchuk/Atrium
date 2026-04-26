import { describe, it, expect } from 'vitest';
import { composeCommand } from '../composeCommand.js';

describe('composeCommand', () => {
  it('free returns only claude', () => {
    expect(composeCommand({ skill: 'free' })).toEqual(['claude']);
  });

  it('init with prompt', () => {
    expect(composeCommand({ skill: 'init', prompt: 'my project' })).toEqual([
      'claude',
      '/architector:init my project',
    ]);
  });

  it('init without prompt degrades gracefully', () => {
    expect(composeCommand({ skill: 'init' })).toEqual(['claude', '/architector:init']);
  });

  it('explore with one node', () => {
    expect(composeCommand({ skill: 'explore', nodes: ['auth-node'] })).toEqual([
      'claude',
      '/architector:explore auth-node',
    ]);
  });

  it('explore with no nodes degrades to no-slug form', () => {
    expect(composeCommand({ skill: 'explore', nodes: [] })).toEqual([
      'claude',
      '/architector:explore',
    ]);
  });

  it('decide with one node', () => {
    expect(composeCommand({ skill: 'decide', nodes: ['storage'] })).toEqual([
      'claude',
      '/architector:decide storage',
    ]);
  });

  it('map with multiple nodes', () => {
    expect(composeCommand({ skill: 'map', nodes: ['a', 'b', 'c'] })).toEqual([
      'claude',
      '/architector:map a b c',
    ]);
  });

  it('finalize with no nodes degrades to no-slugs form', () => {
    expect(composeCommand({ skill: 'finalize', nodes: [] })).toEqual([
      'claude',
      '/architector:finalize',
    ]);
  });

  it('new returns /architector:new', () => {
    expect(composeCommand({ skill: 'new' })).toEqual(['claude', '/architector:new']);
  });

  it('triage with single node', () => {
    expect(composeCommand({ skill: 'triage', nodes: ['auth-node'] })).toEqual([
      'claude',
      '/architector:triage auth-node',
    ]);
  });

  it('triage with multiple nodes', () => {
    expect(composeCommand({ skill: 'triage', nodes: ['a', 'b'] })).toEqual([
      'claude',
      '/architector:triage a b',
    ]);
  });

  it('triage with no nodes degrades to no-slugs form', () => {
    expect(composeCommand({ skill: 'triage', nodes: [] })).toEqual([
      'claude',
      '/architector:triage',
    ]);
  });

  it('audit returns /architector:audit', () => {
    expect(composeCommand({ skill: 'audit' })).toEqual(['claude', '/architector:audit']);
  });

  it('status returns /architector:status', () => {
    expect(composeCommand({ skill: 'status' })).toEqual(['claude', '/architector:status']);
  });

  it.each(['init', 'explore', 'decide', 'map', 'finalize', 'free', 'new', 'triage', 'audit', 'status'] as const)(
    '%s: args must not contain --append-system-prompt-file',
    (skill) => {
      const args = composeCommand({ skill, nodes: ['some-node'], prompt: 'p' });
      expect(args).not.toContain('--append-system-prompt-file');
    },
  );
});
