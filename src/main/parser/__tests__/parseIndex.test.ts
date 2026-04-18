import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIndex } from '../parseIndex';
import { ProjectErrorCode } from '@shared/errors';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('parseIndex', () => {
  it('successfully parses the real index.json fixture', () => {
    const json = fixture('index.json');
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.project).toBe('Atrium');
    expect(result.data.nodes.length).toBeGreaterThan(0);
    expect(result.data.connections.length).toBeGreaterThan(0);
    expect(result.data.sessions.length).toBeGreaterThan(0);
    expect(result.data.warnings).toHaveLength(0);
  });

  it('returns correct node shape from real fixture', () => {
    const json = fixture('index.json');
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.data.nodes[0];
    expect(node).toBeDefined();
    if (!node) return;
    expect(typeof node.slug).toBe('string');
    expect(typeof node.name).toBe('string');
    expect(typeof node.priority).toBe('string');
    expect(typeof node.maturity).toBe('string');
    expect(typeof node.file).toBe('string');
    expect(typeof node.summary).toBe('string');
  });

  it('returns correct connection shape from real fixture', () => {
    const json = fixture('index.json');
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const conn = result.data.connections[0];
    expect(conn).toBeDefined();
    if (!conn) return;
    expect(typeof conn.from).toBe('string');
    expect(typeof conn.to).toBe('string');
    expect(typeof conn.type).toBe('string');
  });

  it('returns Result.err(PARSE_FAILED) for corrupt/truncated JSON', () => {
    const json = fixture('truncated.json');
    const result = parseIndex(json);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ProjectErrorCode.PARSE_FAILED);
  });

  it('returns Result.err(PARSE_FAILED) for completely invalid JSON', () => {
    const result = parseIndex('not json at all }{');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ProjectErrorCode.PARSE_FAILED);
  });

  it('defaults nodes to [] with a warning when missing', () => {
    const json = JSON.stringify({ project: 'Test', connections: [], sessions: [] });
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toEqual([]);
    const hasWarning = result.data.warnings.some((w) => w.message.includes('nodes'));
    expect(hasWarning).toBe(true);
  });

  it('defaults connections to [] with a warning when missing', () => {
    const json = JSON.stringify({ project: 'Test', nodes: [], sessions: [] });
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.connections).toEqual([]);
    const hasWarning = result.data.warnings.some((w) => w.message.includes('connections'));
    expect(hasWarning).toBe(true);
  });

  it('produces UNKNOWN_INDEX_FIELD warning for unexpected top-level fields', () => {
    const json = JSON.stringify({
      project: 'Test',
      nodes: [],
      connections: [],
      sessions: [],
      unknownField: 'surprise',
    });
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hasWarning = result.data.warnings.some(
      (w) => w.code === 'UNKNOWN_INDEX_FIELD' && w.message.includes('unknownField'),
    );
    expect(hasWarning).toBe(true);
  });

  it('passes through unknown priority/maturity values without error', () => {
    const json = JSON.stringify({
      project: 'Test',
      nodes: [{ slug: 'x', name: 'X', priority: 'future-priority', maturity: 'future-maturity', file: 'ideas/x.md', summary: 'S' }],
      connections: [{ from: 'a', to: 'b', type: 'future-type' }],
      sessions: [],
    });
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes[0]?.priority).toBe('future-priority');
    expect(result.data.nodes[0]?.maturity).toBe('future-maturity');
    expect(result.data.connections[0]?.type).toBe('future-type');
    expect(result.data.warnings).toHaveLength(0);
  });

  it('preserves optional note field on connections', () => {
    const json = JSON.stringify({
      project: 'Test',
      nodes: [],
      connections: [{ from: 'a', to: 'b', type: 'depends-on', note: 'important' }],
      sessions: [],
    });
    const result = parseIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.connections[0]?.note).toBe('important');
  });
});
