import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleProjectState } from '../assembleProjectState';
import { parseIndex } from '../parseIndex';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('assembleProjectState', () => {
  it('happy path: assembles a full ProjectState from real fixtures', () => {
    const indexJson = fixture('index.json');
    const indexResult = parseIndex(indexJson);
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;

    const index = indexResult.data;

    // Build the idea files map using only the files we have in fixtures
    const ideaFiles = new Map<string, string>();
    ideaFiles.set('ideas/canvas-ui.md', fixture('canvas-ui.md'));

    const contextMD = fixture('project-context.md');

    const state = assembleProjectState({
      rootPath: '/test/project',
      projectHash: 'testhash',
      index,
      ideaFiles,
      contextMD,
    });

    expect(state.rootPath).toBe('/test/project');
    expect(state.projectName).toBe('Atrium');
    expect(state.created).toBe('2026-04-15');
    expect(state.lastUpdated).toBe('2026-04-16');
    expect(state.nodes.length).toBe(index.nodes.length);
    expect(state.connections.length).toBe(index.connections.length);
    expect(state.sessions.length).toBe(index.sessions.length);

    // canvas-ui should have a real description / sections
    const canvasNode = state.nodes.find((n) => n.slug === 'canvas-ui');
    expect(canvasNode).toBeDefined();
    if (!canvasNode) return;
    expect(typeof canvasNode.sections['Description']).toBe('string');
    expect(canvasNode.markdownContent).toBeDefined();
  });

  it('produces MISSING_IDEA_FILE warning when an idea file is absent', () => {
    const indexResult = parseIndex(
      JSON.stringify({
        project: 'Test',
        nodes: [{ slug: 'missing', name: 'Missing', priority: 'core', maturity: 'raw-idea', file: 'ideas/missing.md', summary: 'S' }],
        connections: [],
        sessions: [],
      }),
    );
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;

    const state = assembleProjectState({
      rootPath: '/test',
      projectHash: 'testhash',
      index: indexResult.data,
      ideaFiles: new Map(),
      contextMD: null,
    });

    expect(state.warnings.some((w) => w.code === 'MISSING_IDEA_FILE')).toBe(true);
    const missingNode = state.nodes.find((n) => n.slug === 'missing');
    expect(missingNode).toBeDefined();
    expect(missingNode?.description).toBe('');
    expect(missingNode?.sections).toEqual({});
    expect(missingNode?.markdownContent).toBeUndefined();
  });

  it('returns Result-compatible state (no throws) even with all files missing', () => {
    const indexResult = parseIndex(fixture('index.json'));
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;

    // Pass no idea files — all nodes should get MISSING_IDEA_FILE warnings
    const state = assembleProjectState({
      rootPath: '/test',
      projectHash: 'testhash',
      index: indexResult.data,
      ideaFiles: new Map(),
      contextMD: null,
    });

    const missingWarnings = state.warnings.filter((w) => w.code === 'MISSING_IDEA_FILE');
    expect(missingWarnings.length).toBe(indexResult.data.nodes.length);
  });

  it('merges extraWarnings into the result', () => {
    const indexResult = parseIndex(
      JSON.stringify({ project: 'Test', nodes: [], connections: [], sessions: [] }),
    );
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;

    const state = assembleProjectState({
      rootPath: '/test',
      projectHash: 'testhash',
      index: indexResult.data,
      ideaFiles: new Map(),
      contextMD: null,
      extraWarnings: [{ code: 'UNKNOWN_INDEX_FIELD', message: 'extra warning' }],
    });

    expect(state.warnings.some((w) => w.message === 'extra warning')).toBe(true);
  });

  it('handles null contextMD gracefully', () => {
    const indexResult = parseIndex(
      JSON.stringify({ project: 'Test', nodes: [], connections: [], sessions: [] }),
    );
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;

    const state = assembleProjectState({
      rootPath: '/test',
      projectHash: 'testhash',
      index: indexResult.data,
      ideaFiles: new Map(),
      contextMD: null,
    });

    expect(state.context.description).toBe('');
    expect(state.context.sections).toEqual({});
  });

  it('parses project-context.md sections correctly', () => {
    const indexResult = parseIndex(
      JSON.stringify({ project: 'Test', nodes: [], connections: [], sessions: [] }),
    );
    expect(indexResult.ok).toBe(true);
    if (!indexResult.ok) return;

    const state = assembleProjectState({
      rootPath: '/test',
      projectHash: 'testhash',
      index: indexResult.data,
      ideaFiles: new Map(),
      contextMD: fixture('project-context.md'),
    });

    expect(Object.keys(state.context.sections)).toContain('What It Is');
    expect(Object.keys(state.context.sections)).toContain('Who The User Is');
  });
});
