/**
 * Barrel re-export for @shared.
 *
 * Single import path for all shared types, enums, and channel constants:
 *   import { Result, ok, err, IPC, ProjectErrorCode, … } from '@shared';
 */

export * from './result.js';
export * from './errors.js';
export * from './domain.js';
export * from './ipc.js';
