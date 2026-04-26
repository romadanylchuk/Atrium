import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../relativeTime';

function makeIso(now: Date, msAgo: number): string {
  return new Date(now.getTime() - msAgo).toISOString();
}

describe('formatRelativeTime', () => {
  const now = new Date('2024-04-20T12:00:00.000Z');

  it('returns "just now" for 0ms', () => {
    expect(formatRelativeTime(makeIso(now, 0), now)).toBe('just now');
  });

  it('returns "just now" for 59_999ms (just under 60s)', () => {
    expect(formatRelativeTime(makeIso(now, 59_999), now)).toBe('just now');
  });

  it('returns "1m ago" for exactly 60_000ms', () => {
    expect(formatRelativeTime(makeIso(now, 60_000), now)).toBe('1m ago');
  });

  it('returns "5m ago" for 5 minutes', () => {
    expect(formatRelativeTime(makeIso(now, 5 * 60_000), now)).toBe('5m ago');
  });

  it('returns "59m ago" for just under 60 minutes', () => {
    expect(formatRelativeTime(makeIso(now, 59 * 60_000 + 59_999), now)).toBe('59m ago');
  });

  it('returns "1h ago" for exactly 60 minutes', () => {
    expect(formatRelativeTime(makeIso(now, 60 * 60_000), now)).toBe('1h ago');
  });

  it('returns "23h ago" for just under 24 hours', () => {
    expect(formatRelativeTime(makeIso(now, 24 * 3_600_000 - 1), now)).toBe('23h ago');
  });

  it('returns "1d ago" for exactly 24 hours', () => {
    expect(formatRelativeTime(makeIso(now, 24 * 3_600_000), now)).toBe('1d ago');
  });

  it('returns "6d ago" for just under 7 days', () => {
    expect(formatRelativeTime(makeIso(now, 7 * 86_400_000 - 1), now)).toBe('6d ago');
  });

  it('returns locale short date for exactly 7 days', () => {
    const result = formatRelativeTime(makeIso(now, 7 * 86_400_000), now);
    expect(result).toMatch(/\w{3}\s\d+/);
    expect(result).not.toMatch(/ago/);
  });

  it('returns locale short date for 8 days', () => {
    const result = formatRelativeTime(makeIso(now, 8 * 86_400_000), now);
    expect(result).toMatch(/\w{3}\s\d+/);
  });
});
