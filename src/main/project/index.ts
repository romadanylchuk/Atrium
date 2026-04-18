/**
 * project/index.ts — barrel export for the project orchestrator layer.
 *
 * Consumers:
 *   import { openProject } from '@main/project';
 *   import { showOpenFolder } from '@main/project';
 */

export { openProject, readAndAssembleProject } from './openProject';
export { showOpenFolder } from './showOpenFolder';
