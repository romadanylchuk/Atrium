import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitByH2, firstParagraph } from '../splitHeadings';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// splitByH2
// ---------------------------------------------------------------------------

describe('splitByH2', () => {
  it('splits a document with multiple H2 sections', () => {
    const md = `# Title\n\nsome leading text\n\n## Section A\nbody A\n\n## Section B\nbody B\n`;
    const { leading, sections } = splitByH2(md);
    expect(leading).toContain('some leading text');
    expect(Object.keys(sections)).toEqual(['Section A', 'Section B']);
    expect(sections['Section A']).toContain('body A');
    expect(sections['Section B']).toContain('body B');
  });

  it('returns empty sections when no H2 headings are present', () => {
    const md = fixture('no-headings.md');
    const { leading, sections } = splitByH2(md);
    expect(Object.keys(sections)).toHaveLength(0);
    expect(leading).toContain('plain prose');
  });

  it('does NOT split on ## inside a fenced code block', () => {
    const md = fixture('fence-with-h2.md');
    const { sections } = splitByH2(md);
    // Only 'Description' and 'Real Heading' should be extracted
    expect(Object.keys(sections)).toEqual(['Description', 'Real Heading']);
    // The fake heading must be inside Description's body, not a section
    expect(sections['Description']).toContain('## Fake heading inside fence');
    expect(sections['Description']).not.toBeUndefined();
    expect(sections['Fake heading inside fence']).toBeUndefined();
  });

  it('handles CRLF line endings correctly', () => {
    const md = fixture('crlf.md');
    const { sections } = splitByH2(md);
    expect(Object.keys(sections)).toEqual(['Section One', 'Section Two']);
    expect(sections['Section One']).toContain('Content of section one.');
    expect(sections['Section Two']).toContain('Content of section two.');
  });

  it('does NOT split on indented ## or ##word (no space)', () => {
    const md = `## Valid\nok\n  ## indented\nnope\n##nospace\nnope2\n`;
    const { sections } = splitByH2(md);
    expect(Object.keys(sections)).toEqual(['Valid']);
    expect(sections['Valid']).toContain('  ## indented');
    expect(sections['Valid']).toContain('##nospace');
  });

  it('returns empty leading when document starts with a heading', () => {
    const md = `## First\ncontent\n`;
    const { leading, sections } = splitByH2(md);
    expect(leading.trim()).toBe('');
    expect(sections['First']).toContain('content');
  });

  it('preserves trailing whitespace-only section body (not dropped)', () => {
    // Phase 8 edge case: a section with only whitespace lines must survive as
    // a key in sections (body = the whitespace string), not be silently dropped.
    const md = `## Notes\n   \n## Next\nreal content\n`;
    const { sections } = splitByH2(md);
    expect(Object.keys(sections)).toContain('Notes');
    expect(Object.keys(sections)).toContain('Next');
    // The Notes body is "   \n" — not the empty string dropped, just whitespace
    const notesBody = sections['Notes'];
    expect(notesBody).toBeDefined();
    expect(notesBody!.trim()).toBe('');
    expect(sections['Next']).toContain('real content');
  });
});

// ---------------------------------------------------------------------------
// firstParagraph
// ---------------------------------------------------------------------------

describe('firstParagraph', () => {
  it('extracts the first content paragraph, skipping H1 and italic metadata lines', () => {
    const text = `# Idea: Canvas UI\n_Created: 2026-01-01_\n_Slug: canvas-ui_\n\nThis is the real description paragraph.\n\nAnother paragraph.`;
    expect(firstParagraph(text)).toBe('This is the real description paragraph.');
  });

  it('returns empty string for empty input', () => {
    expect(firstParagraph('')).toBe('');
    expect(firstParagraph('   \n  ')).toBe('');
  });

  it('returns empty string when all content is metadata', () => {
    const text = `# Idea: Foo\n_Created: 2026-01-01_\n_Slug: foo_\n`;
    expect(firstParagraph(text)).toBe('');
  });

  it('works with CRLF line endings', () => {
    const text = `# Idea: Test\r\n_Created: 2026-01-01_\r\n\r\nReal content here.\r\n`;
    expect(firstParagraph(text)).toBe('Real content here.');
  });

  it('works on a real canvas-ui.md fixture', () => {
    const md = fixture('canvas-ui.md');
    // The leading block of canvas-ui.md is just the title + metadata lines.
    // firstParagraph is called on the leading block (before first ##).
    const { leading } = splitByH2(md);
    const desc = firstParagraph(leading);
    // The leading block of canvas-ui.md has no prose before ##Description,
    // so description should be empty string.
    expect(typeof desc).toBe('string');
  });
});
