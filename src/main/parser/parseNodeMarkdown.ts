/**
 * parseNodeMarkdown.ts — parses a single `.ai-arch/ideas/*.md` file.
 *
 * Rules:
 * - Never throws on malformed input.
 * - Extracts `description` from the leading block (skipping `# Idea: …` and italic metadata).
 * - Splits sections via `splitByH2`.
 * - Absence of `## ` sections → `sections = {}` + single `MALFORMED_NODE_MD` warning.
 * - Zero Electron or fs imports.
 */

import { splitByH2, firstParagraph } from './splitHeadings';
import type { ParseWarning } from '@shared/domain';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type ParsedNodeMD = {
  readonly description: string;
  readonly sections: Record<string, string>;
  readonly raw: string;
  readonly warnings: ParseWarning[];
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse a node markdown file (`.ai-arch/ideas/*.md`).
 *
 * @param md         The raw markdown string.
 * @param fileLabel  Human-readable label (e.g. relative path) for warnings.
 */
export function parseNodeMarkdown(md: string, fileLabel: string): ParsedNodeMD {
  const warnings: ParseWarning[] = [];

  const { leading, sections } = splitByH2(md);

  // Warn if no sections found (malformed or bare text file).
  if (Object.keys(sections).length === 0) {
    warnings.push({
      code: 'MALFORMED_NODE_MD',
      file: fileLabel,
      message: `No ## sections found in "${fileLabel}"`,
    });
  }

  // Extract description from the leading block (strips title + italic metadata lines).
  const description = firstParagraph(leading);

  return { description, sections, raw: md, warnings };
}
