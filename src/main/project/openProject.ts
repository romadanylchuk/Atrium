/**
 * openProject.ts — Orchestrates dialog → parser → storage into a single Result.
 *
 * Exports:
 *   readAndAssembleProject — steps 1–7 (pure pipeline, no side effects).
 *   openProject            — readAndAssembleProject + bumpRecent side effect.
 *
 * readAndAssembleProject is also used by the WatcherManager debounced re-parse.
 * This module MUST NOT throw on realistic input; all errors are Result envelopes.
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { type Result, ok, err } from '@shared/result';
import { ProjectErrorCode } from '@shared/errors';
import type { ProjectState } from '@shared/domain';
import { parseIndex } from '@main/parser';
import { assembleProjectState } from '@main/parser';
import { bumpRecent } from '@main/storage';

// ---------------------------------------------------------------------------
// Warn prefix
// ---------------------------------------------------------------------------

const WARN_PREFIX = '[atrium:project]';

function warn(msg: string): void {
  console.warn(`${WARN_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Open an Atrium project at the given absolute path.
 *
 * Returns a `Result.ok(ProjectState)` on success, or a typed `Result.err`
 * with a `ProjectErrorCode` on failure. Never throws.
 */
/**
 * Read and assemble a ProjectState from an absolute project path.
 *
 * Steps 1–7 of the pipeline — no side effects (no bumpRecent).
 * Used by both openProject and the watcher's debounced re-parse.
 */
export async function readAndAssembleProject(absPath: string): Promise<Result<ProjectState, ProjectErrorCode>> {
  // Step 1 — verify the root path exists
  try {
    await fs.stat(absPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ProjectErrorCode.PATH_NOT_FOUND, `Path not found: "${absPath}" — ${msg}`);
  }

  // Step 2 — verify .ai-arch/index.json exists
  const archDir = nodePath.join(absPath, '.ai-arch');
  const indexPath = nodePath.join(archDir, 'index.json');

  try {
    await fs.stat(indexPath);
  } catch {
    return err(
      ProjectErrorCode.NOT_AN_ARCH_PROJECT,
      `Not an Atrium project: ".ai-arch/index.json" not found in "${absPath}"`,
    );
  }

  // Step 3 — read index.json
  let jsonString: string;
  try {
    jsonString = await fs.readFile(indexPath, 'utf8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ProjectErrorCode.READ_FAILED, `Failed to read index.json: ${msg}`);
  }

  // Step 4 — parse index
  const indexResult = parseIndex(jsonString);
  if (!indexResult.ok) {
    return err(ProjectErrorCode.PARSE_FAILED, indexResult.error.message);
  }
  const index = indexResult.data;

  // Step 5 — read idea files (missing files are non-fatal)
  const ideaFiles = new Map<string, string>();
  for (const node of index.nodes) {
    const filePath = nodePath.join(archDir, node.file);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      ideaFiles.set(node.file, content);
    } catch {
      warn(`Idea file not readable, will surface as warning: "${node.file}"`);
    }
  }

  // Step 6 — read project-context.md (optional)
  const contextPath = nodePath.join(archDir, 'project-context.md');
  let contextMD: string | null = null;
  try {
    contextMD = await fs.readFile(contextPath, 'utf8');
  } catch {
    // Absent context file is legitimate — pass null to assembler.
  }

  // Step 7 — assemble ProjectState
  return ok(assembleProjectState({ rootPath: absPath, index, ideaFiles, contextMD }));
}

/**
 * Open an Atrium project at the given absolute path.
 *
 * Returns a `Result.ok(ProjectState)` on success, or a typed `Result.err`
 * with a `ProjectErrorCode` on failure. Never throws.
 */
export async function openProject(absPath: string): Promise<Result<ProjectState, ProjectErrorCode>> {
  const r = await readAndAssembleProject(absPath);
  if (r.ok) {
    bumpRecent(absPath, r.data.projectName).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      warn(`bumpRecent failed (non-fatal): ${msg}`);
    });
  }
  return r;
}
