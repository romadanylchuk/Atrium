/**
 * Tests for src/main/parser/parseProjectContext.ts
 *
 * Edge cases: empty file, normal file, trailing-whitespace-only section body.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProjectContext } from '../parseProjectContext';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('parseProjectContext', () => {
  // -------------------------------------------------------------------------
  // Empty / whitespace-only input
  // -------------------------------------------------------------------------

  it('returns { description: "", sections: {} } for empty string — no warning emitted', () => {
    const result = parseProjectContext('');
    expect(result.description).toBe('');
    expect(result.sections).toEqual({});
    // parseProjectContext is a pure function (no side effects) — the test
    // verifies the return shape; absence of warning is structural (no warnings field).
  });

  it('returns empty result for whitespace-only input', () => {
    const result = parseProjectContext('   \n\t\n  ');
    expect(result.description).toBe('');
    expect(result.sections).toEqual({});
  });

  // -------------------------------------------------------------------------
  // Real fixture
  // -------------------------------------------------------------------------

  it('parses project-context.md fixture with correct section keys', () => {
    const md = fixture('project-context.md');
    const result = parseProjectContext(md);
    expect(Object.keys(result.sections)).toContain('What It Is');
    expect(Object.keys(result.sections)).toContain('Who The User Is');
    expect(Object.keys(result.sections)).toContain('Core Metaphor');
    expect(Object.keys(result.sections)).toContain('Key Constraints');
  });

  it('description is a string (may be empty for header-only leading block)', () => {
    const md = fixture('project-context.md');
    const result = parseProjectContext(md);
    expect(typeof result.description).toBe('string');
  });

  // -------------------------------------------------------------------------
  // Trailing whitespace-only section body
  // -------------------------------------------------------------------------

  it('preserves whitespace-only section body as empty string after trimming', () => {
    // The whitespace-section.md fixture has:
    //   ## Notes\n   \n## Next Section\n...
    const md = fixture('whitespace-section.md');
    const result = parseProjectContext(md);
    // Both sections should be present
    expect(Object.keys(result.sections)).toContain('Notes');
    expect(Object.keys(result.sections)).toContain('Next Section');
    // Notes body is whitespace-only — after trim it should be empty string, not dropped
    const notesBody = result.sections['Notes'];
    expect(notesBody).toBeDefined();
    expect(notesBody!.trim()).toBe('');
  });

  // -------------------------------------------------------------------------
  // CRLF — parseProjectContext delegates to splitByH2 which handles \r?\n
  // -------------------------------------------------------------------------

  it('parses CRLF file without dropping sections', () => {
    const md = fixture('crlf.md');
    const result = parseProjectContext(md);
    expect(Object.keys(result.sections)).toContain('Section One');
    expect(Object.keys(result.sections)).toContain('Section Two');
  });
});
