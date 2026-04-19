import { describe, it, expect } from 'vitest';
import { isRecentsPoisoningError } from '../recentsPruning';

function makeErrno(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

function makeEncoded(code: string): { message: string } {
  return { message: `${code}: Path not found: "/some/path" — ${code}` };
}

describe('isRecentsPoisoningError — direct ErrnoException', () => {
  it('ENOENT → true (linux)', () => {
    expect(isRecentsPoisoningError(makeErrno('ENOENT'), 'linux')).toBe(true);
  });

  it('ENOENT → true (win32)', () => {
    expect(isRecentsPoisoningError(makeErrno('ENOENT'), 'win32')).toBe(true);
  });

  it('ENOTDIR → true (linux)', () => {
    expect(isRecentsPoisoningError(makeErrno('ENOTDIR'), 'linux')).toBe(true);
  });

  it('ENOTDIR → true (win32)', () => {
    expect(isRecentsPoisoningError(makeErrno('ENOTDIR'), 'win32')).toBe(true);
  });

  it('EACCES → true on linux', () => {
    expect(isRecentsPoisoningError(makeErrno('EACCES'), 'linux')).toBe(true);
  });

  it('EACCES → false on win32', () => {
    expect(isRecentsPoisoningError(makeErrno('EACCES'), 'win32')).toBe(false);
  });

  it('EBUSY → false', () => {
    expect(isRecentsPoisoningError(makeErrno('EBUSY'), 'linux')).toBe(false);
  });

  it('EMFILE → false', () => {
    expect(isRecentsPoisoningError(makeErrno('EMFILE'), 'linux')).toBe(false);
  });
});

describe('isRecentsPoisoningError — encoded message (from readAndAssembleProject)', () => {
  it('ENOENT encoded → true', () => {
    expect(isRecentsPoisoningError(makeEncoded('ENOENT'), 'linux')).toBe(true);
  });

  it('ENOTDIR encoded → true', () => {
    expect(isRecentsPoisoningError(makeEncoded('ENOTDIR'), 'linux')).toBe(true);
  });

  it('EACCES encoded → true on linux', () => {
    expect(isRecentsPoisoningError(makeEncoded('EACCES'), 'linux')).toBe(true);
  });

  it('EACCES encoded → false on win32', () => {
    expect(isRecentsPoisoningError(makeEncoded('EACCES'), 'win32')).toBe(false);
  });

  it('EBUSY encoded → false', () => {
    expect(isRecentsPoisoningError(makeEncoded('EBUSY'), 'linux')).toBe(false);
  });
});

describe('isRecentsPoisoningError — non-errno values', () => {
  it('plain Error with no code → false', () => {
    expect(isRecentsPoisoningError(new Error('layout parse failed'), 'linux')).toBe(false);
  });

  it('null → false', () => {
    expect(isRecentsPoisoningError(null, 'linux')).toBe(false);
  });

  it('string → false', () => {
    expect(isRecentsPoisoningError('ENOENT', 'linux')).toBe(false);
  });

  it('number → false', () => {
    expect(isRecentsPoisoningError(42, 'linux')).toBe(false);
  });

  it('object with no code/message → false', () => {
    expect(isRecentsPoisoningError({}, 'linux')).toBe(false);
  });
});
