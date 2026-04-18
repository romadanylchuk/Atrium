/**
 * splitHeadings.ts — pure markdown heading splitter.
 *
 * Rules:
 * - Only splits on `## ` (two hashes + space) at column 0.
 * - Tracks backtick code fences (``` at column 0). While inside a fence,
 *   heading lines are NOT treated as section boundaries.
 * - Handles both LF and CRLF line endings.
 * - Zero Electron or fs imports.
 */

/**
 * Split a markdown string by top-level H2 headings (`## ` at column 0).
 *
 * @returns `leading` — everything before the first `## ` (may be empty string),
 *          `sections` — ordered map of heading text → section body (heading line excluded).
 */
export function splitByH2(md: string): { leading: string; sections: Record<string, string> } {
  // Normalise CRLF → LF so all logic below works uniformly.
  const normalised = md.replace(/\r\n/g, '\n');
  const lines = normalised.split('\n');

  const sections: Record<string, string> = {};
  const leadingLines: string[] = [];

  let insideFence = false;
  let currentHeading: string | null = null;
  let currentBodyLines: string[] = [];

  for (const line of lines) {
    // Toggle fence state on ``` at column 0.
    if (line.startsWith('```')) {
      insideFence = !insideFence;
    }

    if (!insideFence && line.startsWith('## ')) {
      // Save previous section (or append to leading block).
      if (currentHeading === null) {
        // Still in the leading block; flush it.
        leadingLines.push(...currentBodyLines);
        currentBodyLines = [];
      } else {
        // End the previous named section.
        sections[currentHeading] = currentBodyLines.join('\n');
        currentBodyLines = [];
      }
      currentHeading = line.slice(3).trim();
    } else {
      currentBodyLines.push(line);
    }
  }

  // Flush the last section.
  if (currentHeading === null) {
    leadingLines.push(...currentBodyLines);
  } else {
    sections[currentHeading] = currentBodyLines.join('\n');
  }

  const leading = leadingLines.join('\n');

  return { leading, sections };
}

/**
 * Extract the first non-empty, non-metadata paragraph from a block of text.
 *
 * Skips:
 * - Lines starting with `# ` (H1 title)
 * - Lines matching `_..._` (italic metadata lines like `_Created: …_`)
 *
 * Paragraphs are separated by one or more blank lines.
 */
export function firstParagraph(text: string): string {
  // Normalise CRLF.
  const normalised = text.replace(/\r\n/g, '\n').trim();
  if (!normalised) return '';

  // Split into paragraphs on blank lines.
  const paragraphs = normalised.split(/\n{2,}/);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Filter out metadata lines within the paragraph.
    const contentLines = trimmed.split('\n').filter((line) => {
      const l = line.trim();
      if (l.startsWith('# ')) return false;          // H1 title
      if (/^_.*_$/.test(l)) return false;            // italic metadata
      return true;
    });

    const content = contentLines.join('\n').trim();
    if (content) return content;
  }

  return '';
}
