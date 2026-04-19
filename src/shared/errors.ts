/**
 * Error code enums for all IPC namespaces.
 *
 * Pattern: `as const` object + derived `type` union (const enum is banned — isolatedModules).
 * Each namespace enum includes CommonErrorCode members via object spread.
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

// ---------------------------------------------------------------------------
// Common — shared by every namespace
// ---------------------------------------------------------------------------

export const CommonErrorCode = {
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL: 'INTERNAL',
} as const;

export type CommonErrorCode = (typeof CommonErrorCode)[keyof typeof CommonErrorCode];

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectErrorCode = {
  ...CommonErrorCode,
  NOT_AN_ARCH_PROJECT: 'NOT_AN_ARCH_PROJECT',
  PATH_NOT_FOUND: 'PATH_NOT_FOUND',
  READ_FAILED: 'READ_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  STORAGE_FAILED: 'STORAGE_FAILED',
} as const;

export type ProjectErrorCode = (typeof ProjectErrorCode)[keyof typeof ProjectErrorCode];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export const DialogErrorCode = {
  ...CommonErrorCode,
  DIALOG_FAILED: 'DIALOG_FAILED',
} as const;

export type DialogErrorCode = (typeof DialogErrorCode)[keyof typeof DialogErrorCode];

// ---------------------------------------------------------------------------
// FileSync  (D3 binding: must include these five members at minimum)
// ---------------------------------------------------------------------------

export const FileSyncErrorCode = {
  ...CommonErrorCode,
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_HANDLE: 'INVALID_HANDLE',
  WATCHER_FAILED: 'WATCHER_FAILED',
  IPC_FAILED: 'IPC_FAILED',
} as const;

export type FileSyncErrorCode = (typeof FileSyncErrorCode)[keyof typeof FileSyncErrorCode];

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export const TerminalErrorCode = {
  ...CommonErrorCode,
  SPAWN_FAILED: 'SPAWN_FAILED',
  KILL_FAILED: 'KILL_FAILED',
  INVALID_HANDLE: 'INVALID_HANDLE',
  WRITE_TOO_LARGE: 'WRITE_TOO_LARGE',
} as const;

export type TerminalErrorCode = (typeof TerminalErrorCode)[keyof typeof TerminalErrorCode];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const LayoutErrorCode = {
  ...CommonErrorCode,
  NOT_FOUND: 'NOT_FOUND',
  CORRUPT: 'CORRUPT',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  IO_FAILED: 'IO_FAILED',
} as const;

export type LayoutErrorCode = (typeof LayoutErrorCode)[keyof typeof LayoutErrorCode];

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const HealthErrorCode = {
  ...CommonErrorCode,
  CLAUDE_NOT_FOUND: 'CLAUDE_NOT_FOUND',
  VERSION_UNPARSEABLE: 'VERSION_UNPARSEABLE',
  HEALTH_TIMEOUT: 'HEALTH_TIMEOUT',
} as const;

export type HealthErrorCode = (typeof HealthErrorCode)[keyof typeof HealthErrorCode];

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

export const SkillErrorCode = {
  ...CommonErrorCode,
  COMPOSE_FAILED: 'COMPOSE_FAILED',
  SPAWN_FAILED: 'SPAWN_FAILED',
  INVALID_SKILL: 'INVALID_SKILL',
} as const;

export type SkillErrorCode = (typeof SkillErrorCode)[keyof typeof SkillErrorCode];
