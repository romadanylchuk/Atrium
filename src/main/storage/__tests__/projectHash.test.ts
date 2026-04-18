/**
 * Tests for src/main/storage/projectHash.ts
 *
 * Covers all slug rule branches from brief §D1 and hash determinism.
 * process.platform is stubbed to test both win32 and posix normalisation.
 */

import * as crypto from 'node:crypto';
import * as nodePath from 'node:path';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';

// We import the module under test AFTER stubbing platform where needed.
// For static import we re-import dynamically in platform-specific suites.
import { slugify, normalizePath, hashKeyOnly, hashProjectPath } from '../projectHash.js';

// ---------------------------------------------------------------------------
// Slugify rules
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('lowercases the input', () => {
    expect(slugify('MyProject')).toBe('myproject');
  });

  it('replaces non-alphanumeric chars with hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world');
    expect(slugify('foo.bar')).toBe('foo-bar');
    expect(slugify('foo_bar')).toBe('foo-bar');
  });

  it('collapses consecutive separator runs into one hyphen', () => {
    expect(slugify('foo---bar')).toBe('foo-bar');
    expect(slugify('foo...bar')).toBe('foo-bar');
    expect(slugify('a  b  c')).toBe('a-b-c');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---foo---')).toBe('foo');
    expect(slugify('  spaces  ')).toBe('spaces');
  });

  it('caps at 32 characters', () => {
    const long = 'a'.repeat(40);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(32);
  });

  it('trims hyphens introduced by the 32-char cap', () => {
    // e.g. "aaaa-bbbbb" where the cap falls mid-separator
    const input = 'a'.repeat(31) + '-extra';
    const result = slugify(input);
    expect(result).not.toMatch(/^-|-$/);
    expect(result.length).toBeLessThanOrEqual(32);
  });

  it('falls back to "project" for an empty string', () => {
    expect(slugify('')).toBe('project');
  });

  it('falls back to "project" for all-special-chars input', () => {
    expect(slugify('!!!---!!!')).toBe('project');
    expect(slugify('...')).toBe('project');
    expect(slugify('___')).toBe('project');
  });

  it('falls back to "project" when slug becomes empty after slicing', () => {
    // 32 chars of hyphens collapses to empty string
    expect(slugify('-'.repeat(40))).toBe('project');
  });

  it('handles already-valid slugs without mutation', () => {
    expect(slugify('my-project')).toBe('my-project');
    expect(slugify('abc123')).toBe('abc123');
  });

  it('produces only [a-z0-9-] characters', () => {
    const result = slugify('Hello World! v2.0 (beta)');
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });
});

// ---------------------------------------------------------------------------
// normalizePath — posix behaviour
// ---------------------------------------------------------------------------

describe('normalizePath on posix', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('resolves the path but does NOT lowercase on posix', () => {
    const input = '/some/Path/With/Caps';
    const result = normalizePath(input);
    expect(result).toBe(nodePath.resolve(input));
    // Case is preserved on posix.
    expect(result).toContain('Path');
  });

  it('two paths differing only in case are NOT equal on posix', () => {
    const a = normalizePath('/home/user/MyProject');
    const b = normalizePath('/home/user/myproject');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// normalizePath — win32 behaviour
// ---------------------------------------------------------------------------

describe('normalizePath on win32', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  it('lowercases the resolved path on win32', () => {
    const input = 'C:\\Users\\Roma\\MyProject';
    const result = normalizePath(input);
    expect(result).toBe(result.toLowerCase());
  });

  it('two paths differing only in case ARE equal on win32', () => {
    const a = normalizePath('C:\\Users\\Roma\\MyProject');
    const b = normalizePath('C:\\Users\\Roma\\myproject');
    // After resolve+lowercase both collapse to the same string.
    // Note: on a Linux test runner, path.resolve('C:\\...') won't behave like Windows,
    // but the toLowerCase step is what we're asserting here.
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// hashKeyOnly — determinism and length
// ---------------------------------------------------------------------------

describe('hashKeyOnly', () => {
  it('returns exactly 8 hex characters', () => {
    const hash = hashKeyOnly('/some/project/path');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for the same input', () => {
    const path = '/home/user/projects/atrium';
    expect(hashKeyOnly(path)).toBe(hashKeyOnly(path));
  });

  it('produces different hashes for different paths', () => {
    expect(hashKeyOnly('/path/a')).not.toBe(hashKeyOnly('/path/b'));
  });

  it('matches manual sha256 computation', () => {
    // Verify the hash matches what we get from crypto directly.
    const abs = '/test/project';
    const norm = normalizePath(abs);
    const expected = crypto.createHash('sha256').update(norm).digest('hex').slice(0, 8);
    expect(hashKeyOnly(abs)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// hashProjectPath — full slug-hash dir name
// ---------------------------------------------------------------------------

describe('hashProjectPath', () => {
  it('returns "<slug>-<8-hex>" format', () => {
    const result = hashProjectPath('/home/user/my-app');
    expect(result).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/);
  });

  it('slug part is cosmetic — uses the basename', () => {
    const result = hashProjectPath('/home/user/my-app');
    expect(result.startsWith('my-app-')).toBe(true);
  });

  it('hash part (suffix) equals hashKeyOnly output', () => {
    const abs = '/home/user/my-app';
    const full = hashProjectPath(abs);
    const hash = hashKeyOnly(abs);
    expect(full.endsWith(`-${hash}`)).toBe(true);
  });

  it('is deterministic', () => {
    const abs = '/projects/cool-thing';
    expect(hashProjectPath(abs)).toBe(hashProjectPath(abs));
  });

  it('uses "project" slug for pathological basenames', () => {
    const abs = '/home/user/!!!';
    const result = hashProjectPath(abs);
    const hash = hashKeyOnly(abs);
    expect(result).toBe(`project-${hash}`);
  });

  it('capitalisation matters on posix', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    try {
      const a = hashProjectPath('/projects/MyApp');
      const b = hashProjectPath('/projects/myapp');
      expect(a).not.toBe(b);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    }
  });

  it('capitalisation is ignored on win32 (same hash)', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
    try {
      const a = hashProjectPath('C:\\Projects\\MyApp');
      const b = hashProjectPath('C:\\Projects\\myapp');
      // Both normalise to the same lowercase string → identical hash suffix.
      const hashA = a.split('-').pop();
      const hashB = b.split('-').pop();
      expect(hashA).toBe(hashB);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    }
  });
});

