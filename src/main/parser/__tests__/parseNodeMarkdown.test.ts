import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNodeMarkdown } from '../parseNodeMarkdown';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('parseNodeMarkdown', () => {
  it('parses canvas-ui.md fixture and extracts expected sections', () => {
    const md = fixture('canvas-ui.md');
    const result = parseNodeMarkdown(md, 'ideas/canvas-ui.md');

    expect(result.warnings).toHaveLength(0);
    expect(result.raw).toBe(md);

    // Should have known sections from canvas-ui.md
    const sectionKeys = Object.keys(result.sections);
    expect(sectionKeys).toContain('Description');
    expect(sectionKeys).toContain('Decision');
    expect(sectionKeys).toContain('Priority');
    expect(sectionKeys).toContain('Maturity');
    expect(sectionKeys).toContain('Notes');
    expect(sectionKeys).toContain('Connections');
    expect(sectionKeys).toContain('History');
  });

  it('extracts description from canvas-ui.md', () => {
    const md = fixture('canvas-ui.md');
    const result = parseNodeMarkdown(md, 'ideas/canvas-ui.md');
    // canvas-ui.md has no prose before the first ## — title + italic metadata only
    // so description comes from the leading block's first paragraph (empty after filtering)
    expect(typeof result.description).toBe('string');
  });

  it('returns MALFORMED_NODE_MD warning and empty sections for no-headings file', () => {
    const md = fixture('no-headings.md');
    const result = parseNodeMarkdown(md, 'ideas/no-headings.md');

    expect(result.sections).toEqual({});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('MALFORMED_NODE_MD');
    expect(result.warnings[0]?.file).toBe('ideas/no-headings.md');
  });

  it('never throws on empty string input', () => {
    expect(() => parseNodeMarkdown('', 'empty.md')).not.toThrow();
    const result = parseNodeMarkdown('', 'empty.md');
    expect(result.sections).toEqual({});
    expect(result.description).toBe('');
    expect(result.warnings).toHaveLength(1);
  });

  it('handles Windows CRLF line endings', () => {
    const md = fixture('crlf.md');
    const result = parseNodeMarkdown(md, 'ideas/crlf.md');

    expect(result.warnings).toHaveLength(0);
    expect(Object.keys(result.sections)).toContain('Section One');
    expect(Object.keys(result.sections)).toContain('Section Two');
  });

  it('does not split ## inside a fenced code block', () => {
    const md = fixture('fence-with-h2.md');
    const result = parseNodeMarkdown(md, 'ideas/fence-with-h2.md');

    expect(result.warnings).toHaveLength(0);
    expect(Object.keys(result.sections)).toContain('Description');
    expect(Object.keys(result.sections)).toContain('Real Heading');
    expect(Object.keys(result.sections)).not.toContain('Fake heading inside fence');
    // The fake heading line should be in the Description body
    expect(result.sections['Description']).toContain('## Fake heading inside fence');
  });

  it('preserves the raw markdown unchanged', () => {
    const md = fixture('canvas-ui.md');
    const result = parseNodeMarkdown(md, 'ideas/canvas-ui.md');
    expect(result.raw).toBe(md);
  });

  it('trailing whitespace-only section body is preserved (not dropped)', () => {
    const md = fixture('whitespace-section.md');
    const result = parseNodeMarkdown(md, 'ideas/whitespace-section.md');
    // Notes section body is whitespace-only — should be present in sections, body trims to ''
    expect(Object.keys(result.sections)).toContain('Notes');
    expect(Object.keys(result.sections)).toContain('Next Section');
    expect(result.sections['Notes']!.trim()).toBe('');
    expect(result.warnings).toHaveLength(0);
  });

  it('empty string input emits exactly one MALFORMED_NODE_MD warning', () => {
    const result = parseNodeMarkdown('', 'empty.md');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('MALFORMED_NODE_MD');
    expect(result.warnings[0]?.file).toBe('empty.md');
  });
});
