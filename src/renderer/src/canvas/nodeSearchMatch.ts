export type SearchableNode = { slug: string; name: string; maturity: string };

export type NodeMatch = SearchableNode & {
  /** Start/end of the matched substring inside `name`, or null when only the slug matched. */
  range: [number, number] | null;
};

export const MAX_SEARCH_RESULTS = 8;

/**
 * Case-insensitive node lookup by name (or slug). Ranking: name prefix, then a word
 * inside the name starting with the query, then any substring, then slug-only matches.
 * Ties keep alphabetical order by name.
 */
export function searchNodes(
  nodes: SearchableNode[],
  query: string,
  limit = MAX_SEARCH_RESULTS,
): NodeMatch[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: Array<{ match: NodeMatch; score: number }> = [];
  for (const node of nodes) {
    const name = node.name.toLowerCase();
    const idx = name.indexOf(q);
    if (idx !== -1) {
      const wordStart = idx === 0 || /[\s\-_/.]/.test(name[idx - 1] ?? '');
      const score = idx === 0 ? 0 : wordStart ? 1 : 2;
      scored.push({ match: { ...node, range: [idx, idx + q.length] }, score });
    } else if (node.slug.toLowerCase().includes(q)) {
      scored.push({ match: { ...node, range: null }, score: 3 });
    }
  }

  scored.sort((a, b) => a.score - b.score || a.match.name.localeCompare(b.match.name));
  return scored.slice(0, limit).map((s) => s.match);
}
