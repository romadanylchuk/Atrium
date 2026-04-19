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
    const canonicalColors = Object.values(MATURITY_STYLE).map((s) => s.color);
    expect(canonicalColors).not.toContain(UNKNOWN_MATURITY_STYLE.color);
  });
});

describe('resolveConnectionStyle', () => {
  it('known connection types round-trip to canonical style', () => {
    const known = ['depends-on', 'informs', 'extends', 'feeds', 'uses'] as const;
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

  it('UNKNOWN_CONNECTION_STYLE has width 3 (thicker than normal 2px)', () => {
    expect(UNKNOWN_CONNECTION_STYLE.width).toBe(3);
  });

  it('UNKNOWN_CONNECTION_STYLE color is distinct from all canonical connection styles', () => {
    const canonicalColors = Object.values(CONNECTION_STYLE).map((s) => s.color);
    expect(canonicalColors).not.toContain(UNKNOWN_CONNECTION_STYLE.color);
  });
});
