/**
 * parseProjectContext.ts — parses `.ai-arch/project-context.md`.
 *
 * Rules:
 * - Empty file → `{ description: '', sections: {} }`, NO warning.
 * - Keys are the raw heading text (whitespace-trimmed).
 * - `description` is the first paragraph before the first `## `.
 * - Zero Electron or fs imports.
 */

import { splitByH2, firstParagraph } from './splitHeadings';
import type { ProjectContext } from '@shared/domain';

/**
 * Parse the content of `project-context.md` into a `ProjectContext`.
 *
 * Never throws. Empty string input returns `{ description: '', sections: {} }`.
 */
export function parseProjectContext(md: string): ProjectContext {
  if (!md.trim()) {
    return { description: '', sections: {} };
  }

  const { leading, sections } = splitByH2(md);

  const description = firstParagraph(leading);

  return { description, sections };
}
