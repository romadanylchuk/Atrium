/**
 * Barrel export for src/main/storage/.
 *
 * Consumers:
 *   import { getUserDataDir, getConfigPath, getConsultationPath, … } from '@main/storage';
 *   import { hashProjectPath, hashKeyOnly, slugify, normalizePath } from '@main/storage';
 *   import { atomicWriteJson } from '@main/storage';
 *   import { loadAppConfig, saveAppConfig, bumpRecent, getRecents } from '@main/storage';
 *   import { loadLayout, saveLayout, loadLayoutByHash, saveLayoutByHash } from '@main/storage';
 */

export {
  getUserDataDir,
  __setUserDataDirForTests,
  getConfigPath,
  getProjectsDir,
  getProjectDir,
  getLayoutPath,
  getMetaPath,
  getConsultationPath,
} from './paths.js';

export {
  normalizePath,
  slugify,
  hashKeyOnly,
  hashProjectPath,
} from './projectHash.js';

export { atomicWriteJson } from './atomicWrite.js';

export type { AppConfigV1 } from './appConfig.js';
export {
  CURRENT_CONFIG_VERSION,
  loadAppConfig,
  saveAppConfig,
  bumpRecent,
  getRecents,
  pruneRecent,
} from './appConfig.js';

export type { LayoutFileV1, NodePosition, Viewport } from './layout.js';
export { loadLayout, saveLayout, layoutPathFor, loadLayoutByHash, saveLayoutByHash } from './layout.js';
