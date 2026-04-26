/**
 * Barrel re-export for @shared.
 *
 * Single import path for all shared types, enums, and channel constants:
 *   import { Result, ok, err, IPC, ProjectErrorCode, … } from '@shared';
 */

export * from './result.js';
export * from './errors.js';
export * from './domain.js';
export * from './schema/aiArch.js';
export * from './ipc.js';
export * from './layout.js';
export * from './skill/spawn.js';
export * from './consultation.js';
