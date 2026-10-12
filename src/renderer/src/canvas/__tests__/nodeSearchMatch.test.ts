import { describe, it, expect } from 'vitest';
import { searchNodes } from '../nodeSearchMatch';

const nodes = [
  { slug: 'canvas-ui', name: 'Canvas UI', maturity: 'ready' },
  { slug: 'cli-engine', name: 'CLI Engine', maturity: 'ready' },
  { slug: 'state-management', name: 'State Management', maturity: 'decided' },
  { slug: 'data-layer', name: 'Data Layer', maturity: 'ready' },
  { slug: 'electron-ipc', name: 'IPC Bridge', maturity: 'explored' },
];

describe('searchNodes', () => {
  it('returns nothing for a blank query', () => {
    expect(searchNodes(nodes, '   ')).toEqual([]);
  });

  it('is case-insensitive and reports the matched range', () => {
    const [m] = searchNodes(nodes, 'canv');
    expect(m?.slug).toBe('canvas-ui');
    expect(m?.range).toEqual([0, 4]);
  });

  it('ranks name prefix, then word start, then substring (alphabetical within a tier)', () => {
    expect(searchNodes(nodes, 'e').map((m) => m.slug)).toEqual([
      'cli-engine', // word start
      'data-layer', // substrings, alphabetical by name
      'electron-ipc',
      'state-management',
    ]);
    expect(searchNodes(nodes, 'cl').map((m) => m.slug)).toEqual(['cli-engine']);
  });

  it('falls back to slug matches with no name range', () => {
    const [m] = searchNodes(nodes, 'electron');
    expect(m?.slug).toBe('electron-ipc');
    expect(m?.range).toBeNull();
  });

  it('respects the result limit', () => {
    expect(searchNodes(nodes, 'a', 2)).toHaveLength(2);
  });
});
