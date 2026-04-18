/**
 * assembleProjectState.ts — combines parsed index + idea files + context into `ProjectState`.
 *
 * Rules:
 * - Missing idea file → `MISSING_IDEA_FILE` warning + node with empty description/sections.
 * - All warnings (from index, node MD, extra) are merged into `ProjectState.warnings`.
 * - Zero Electron or fs imports.
 */

import { parseNodeMarkdown } from './parseNodeMarkdown';
import { parseProjectContext } from './parseProjectContext';
import type { ParsedIndex } from './parseIndex';
import type { ProjectState, NodeData, ParseWarning } from '@shared/domain';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type AssembleInput = {
  readonly rootPath: string;
  readonly index: ParsedIndex;
  /** Map of relative file path (e.g. "ideas/canvas-ui.md") → raw markdown string. */
  readonly ideaFiles: Map<string, string>;
  /** Raw content of project-context.md, or null if the file was absent. */
  readonly contextMD: string | null;
  readonly extraWarnings?: ParseWarning[];
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Assemble a `ProjectState` from the parsed index, idea file contents, and context.
 */
export function assembleProjectState(input: AssembleInput): ProjectState {
  const { rootPath, index, ideaFiles, contextMD, extraWarnings = [] } = input;
  const allWarnings: ParseWarning[] = [...index.warnings, ...extraWarnings];

  // --- Parse project context ---
  const context = parseProjectContext(contextMD ?? '');

  // --- Assemble nodes ---
  const nodes: NodeData[] = index.nodes.map((indexNode) => {
    const mdContent = ideaFiles.get(indexNode.file);

    if (mdContent === undefined) {
      allWarnings.push({
        code: 'MISSING_IDEA_FILE',
        file: indexNode.file,
        message: `Idea file not found: "${indexNode.file}"`,
      });
      return {
        slug: indexNode.slug,
        name: indexNode.name,
        priority: indexNode.priority,
        maturity: indexNode.maturity,
        file: indexNode.file,
        summary: indexNode.summary,
        description: '',
        sections: {},
      } satisfies NodeData;
    }

    const parsed = parseNodeMarkdown(mdContent, indexNode.file);
    allWarnings.push(...parsed.warnings);

    return {
      slug: indexNode.slug,
      name: indexNode.name,
      priority: indexNode.priority,
      maturity: indexNode.maturity,
      file: indexNode.file,
      summary: indexNode.summary,
      description: parsed.description,
      markdownContent: parsed.raw,
      sections: parsed.sections,
    } satisfies NodeData;
  });

  return {
    rootPath,
    projectName: index.project,
    created: index.created,
    lastUpdated: index.last_updated,
    context,
    nodes,
    connections: index.connections,
    sessions: index.sessions,
    warnings: allWarnings,
  };
}
