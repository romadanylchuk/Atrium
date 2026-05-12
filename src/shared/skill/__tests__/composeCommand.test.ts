import { describe, it, expect } from 'vitest';
import { composeCommand, composeConsultationCommand } from '../composeCommand.js';
import { CONSULTATION_SYSTEM_PROMPT } from '@shared/consultation/systemPrompt';

describe('composeCommand', () => {
  it('free returns claude --model opus', () => {
    expect(composeCommand({ skill: 'free' })).toEqual(['claude', '--model', 'opus']);
  });

  it('init with prompt', () => {
    expect(composeCommand({ skill: 'init', prompt: 'my project' })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:new my project',
    ]);
  });

  it('init without prompt degrades gracefully', () => {
    expect(composeCommand({ skill: 'init' })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:new',
    ]);
  });

  it('explore with one node', () => {
    expect(composeCommand({ skill: 'explore', nodes: ['auth-node'] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:explore auth-node',
    ]);
  });

  it('explore with no nodes degrades to no-slug form', () => {
    expect(composeCommand({ skill: 'explore', nodes: [] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:explore',
    ]);
  });

  it('decide with one node', () => {
    expect(composeCommand({ skill: 'decide', nodes: ['storage'] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:decide storage',
    ]);
  });

  it('map with multiple nodes', () => {
    expect(composeCommand({ skill: 'map', nodes: ['a', 'b', 'c'] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:map a b c',
    ]);
  });

  it('finalize with no nodes degrades to no-slugs form', () => {
    expect(composeCommand({ skill: 'finalize', nodes: [] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:finalize',
    ]);
  });

  it('new returns /architector:new', () => {
    expect(composeCommand({ skill: 'new' })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:new',
    ]);
  });

  it('triage with single node', () => {
    expect(composeCommand({ skill: 'triage', nodes: ['auth-node'] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:triage auth-node',
    ]);
  });

  it('triage with multiple nodes', () => {
    expect(composeCommand({ skill: 'triage', nodes: ['a', 'b'] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:triage a b',
    ]);
  });

  it('triage with no nodes degrades to no-slugs form', () => {
    expect(composeCommand({ skill: 'triage', nodes: [] })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:triage',
    ]);
  });

  it('audit returns /architector:audit', () => {
    expect(composeCommand({ skill: 'audit' })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:audit',
    ]);
  });

  it('status returns /architector:status', () => {
    expect(composeCommand({ skill: 'status' })).toEqual([
      'claude',
      '--model',
      'opus',
      '/architector:status',
    ]);
  });

  it.each(['init', 'explore', 'decide', 'map', 'finalize', 'free', 'new', 'triage', 'audit', 'status'] as const)(
    '%s: args must not contain --append-system-prompt-file',
    (skill) => {
      const args = composeCommand({ skill, nodes: ['some-node'], prompt: 'p' });
      expect(args).not.toContain('--append-system-prompt-file');
    },
  );
});

describe('composeConsultationCommand', () => {
  it('first element is claude', () => {
    expect(composeConsultationCommand('/some/path')[0]).toBe('claude');
  });

  it('contains --model followed by opus', () => {
    const result = composeConsultationCommand('/some/path');
    const idx = result.indexOf('--model');
    expect(idx).toBeGreaterThan(-1);
    expect(result[idx + 1]).toBe('opus');
  });

  it('contains --permission-mode followed by dontAsk', () => {
    const result = composeConsultationCommand('/some/path');
    const idx = result.indexOf('--permission-mode');
    expect(idx).toBeGreaterThan(-1);
    expect(result[idx + 1]).toBe('dontAsk');
  });

  it('contains --system-prompt followed by the constant', () => {
    const result = composeConsultationCommand('/some/path');
    const idx = result.indexOf('--system-prompt');
    expect(idx).toBeGreaterThan(-1);
    expect(result[idx + 1]).toBe(CONSULTATION_SYSTEM_PROMPT);
  });

  it('contains --add-dir followed by projectRoot', () => {
    const result = composeConsultationCommand('/my/project');
    const idx = result.indexOf('--add-dir');
    expect(idx).toBeGreaterThan(-1);
    expect(result[idx + 1]).toBe('/my/project');
  });

  it('contains --allowedTools followed by Read, Grep, Glob as separate elements', () => {
    const result = composeConsultationCommand('/some/path');
    const idx = result.indexOf('--allowedTools');
    expect(idx).toBeGreaterThan(-1);
    expect(result[idx + 1]).toBe('Read');
    expect(result[idx + 2]).toBe('Grep');
    expect(result[idx + 3]).toBe('Glob');
  });

  it('has exactly 13 elements', () => {
    expect(composeConsultationCommand('/some/path')).toHaveLength(13);
  });
});
