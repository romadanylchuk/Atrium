import { describe, it, expect } from 'vitest';
import {
  MATURITY_STYLE,
  CONNECTION_STYLE,
  UNKNOWN_MATURITY_STYLE,
  UNKNOWN_CONNECTION_STYLE,
  resolveMaturityStyle,
  resolveConnectionStyle,
} from '../visualEncoding';

describe('resolveMaturityStyle', () => {
  it('known maturity values round-trip to canonical style', () => {
    const known = ['raw-idea', 'explored', 'decided', 'ready'] as const;
    for (const m of known) {
      const result = resolveMaturityStyle(m);
      expect(result.known).toBe(true);
      expect(result.style).toBe(MATURITY_STYLE[m]);
    }
  });

  it('unknown value returns { known: false, style: UNKNOWN_MATURITY_STYLE }', () => {
    const result = resolveMaturityStyle('prototype');
    expect(result.known).toBe(false);
    expect(result.style).toBe(UNKNOWN_MATURITY_STYLE);
  });

  it('UNKNOWN_MATURITY_STYLE is distinct from all canonical maturity styles', () => {
    const canonicalFills = Object.values(MATURITY_STYLE).map((s) => s.fill);
    expect(canonicalFills).not.toContain(UNKNOWN_MATURITY_STYLE.fill);
  });

  it('ready maturity has borderRadius 6px', () => {
    expect(resolveMaturityStyle('ready').style.borderRadius).toBe('6px');
  });

  it('raw-idea maturity has borderRadius 50% / 50%', () => {
    expect(resolveMaturityStyle('raw-idea').style.borderRadius).toBe('50% / 50%');
  });

  it('decided maturity has borderRadius 3px', () => {
    expect(resolveMaturityStyle('decided').style.borderRadius).toBe('3px');
  });
});

describe('resolveConnectionStyle', () => {
  it('known connection types round-trip to canonical style', () => {
    const known = [
      'dependency',
      'shared-concern',
      'coupled-decision',
      'non-dependency',
      'non-contribution',
      'open-question',
    ] as const;
    for (const t of known) {
      const result = resolveConnectionStyle(t);
      expect(result.known).toBe(true);
      expect(result.style).toBe(CONNECTION_STYLE[t]);
    }
  });

  it('unknown value returns { known: false, style: UNKNOWN_CONNECTION_STYLE }', () => {
    const result = resolveConnectionStyle('unknown-rel');
    expect(result.known).toBe(false);
    expect(result.style).toBe(UNKNOWN_CONNECTION_STYLE);
  });

  it('UNKNOWN_CONNECTION_STYLE has color #6a6a72, stroke dashed, strokeDasharray 4 3', () => {
    const result = resolveConnectionStyle('not-a-known-type');
    expect(result.known).toBe(false);
    expect(result.style).toBe(UNKNOWN_CONNECTION_STYLE);
    expect(result.style.color).toBe('#6a6a72');
    expect(result.style.stroke).toBe('dashed');
    expect(result.style.strokeDasharray).toBe('4 3');
  });

  it('all canonical connection types have width 1.5', () => {
    for (const style of Object.values(CONNECTION_STYLE)) {
      expect(style.width).toBe(1.5);
    }
  });

  it('UNKNOWN_CONNECTION_STYLE has width 1.5', () => {
    expect(UNKNOWN_CONNECTION_STYLE.width).toBe(1.5);
  });

  it('dependency edge has color #5b8fd4, stroke solid, strokeDasharray none', () => {
    const { style } = resolveConnectionStyle('dependency');
    expect(style.color).toBe('#5b8fd4');
    expect(style.stroke).toBe('solid');
    expect(style.strokeDasharray).toBe('none');
  });

  it('shared-concern edge has color #c29a4e, stroke solid, strokeDasharray none', () => {
    const { style } = resolveConnectionStyle('shared-concern');
    expect(style.color).toBe('#c29a4e');
    expect(style.stroke).toBe('solid');
    expect(style.strokeDasharray).toBe('none');
  });

  it('coupled-decision edge has color #a78bc9, stroke solid, strokeDasharray none', () => {
    const { style } = resolveConnectionStyle('coupled-decision');
    expect(style.color).toBe('#a78bc9');
    expect(style.stroke).toBe('solid');
    expect(style.strokeDasharray).toBe('none');
  });

  it('non-dependency edge has color #6a7d9e, stroke dotted, strokeDasharray 2 4', () => {
    const { style } = resolveConnectionStyle('non-dependency');
    expect(style.color).toBe('#6a7d9e');
    expect(style.stroke).toBe('dotted');
    expect(style.strokeDasharray).toBe('2 4');
  });

  it('non-contribution edge has color #6a6a72, stroke dotted, strokeDasharray 2 4', () => {
    const { style } = resolveConnectionStyle('non-contribution');
    expect(style.color).toBe('#6a6a72');
    expect(style.stroke).toBe('dotted');
    expect(style.strokeDasharray).toBe('2 4');
  });

  it('open-question edge has color #d4824a, stroke dashed, strokeDasharray 5 3', () => {
    const { style } = resolveConnectionStyle('open-question');
    expect(style.color).toBe('#d4824a');
    expect(style.stroke).toBe('dashed');
    expect(style.strokeDasharray).toBe('5 3');
  });

  it('UNKNOWN_CONNECTION_STYLE (color, stroke) tuple is distinct from all canonical connection styles', () => {
    const canonicalTuples = Object.values(CONNECTION_STYLE).map((s) => `${s.color}|${s.stroke}`);
    const unknownTuple = `${UNKNOWN_CONNECTION_STYLE.color}|${UNKNOWN_CONNECTION_STYLE.stroke}`;
    expect(canonicalTuples).not.toContain(unknownTuple);
  });
});
