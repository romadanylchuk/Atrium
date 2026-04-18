/**
 * Compile-time type assertions for AtriumAPI.
 *
 * These tests carry zero runtime cost — they exist so `vitest --typecheck`
 * (or `tsc`) will fail if the shape drifts from the contract.
 *
 * Runs under the `main` Vitest project (Node env — no DOM needed).
 */

import { expectTypeOf, test } from 'vitest';
import type { AtriumAPI } from '../api';
import type {
  Result,
  ProjectState,
  ProjectErrorCode,
  DialogErrorCode,
  FileSyncErrorCode,
  TerminalId,
  TerminalErrorCode,
  HealthInfo,
  HealthErrorCode,
  RecentProject,
} from '@shared/index';

// ---------------------------------------------------------------------------
// project namespace
// ---------------------------------------------------------------------------

test('AtriumAPI.project.open returns Promise<Result<ProjectState, ProjectErrorCode>>', () => {
  expectTypeOf<AtriumAPI['project']['open']>()
    .returns.resolves.toEqualTypeOf<Result<ProjectState, ProjectErrorCode>>();
});

test('AtriumAPI.project.switch returns Promise<Result<ProjectState, ProjectErrorCode>>', () => {
  expectTypeOf<AtriumAPI['project']['switch']>()
    .returns.resolves.toEqualTypeOf<Result<ProjectState, ProjectErrorCode>>();
});

test('AtriumAPI.project.getRecents returns Promise<Result<RecentProject[], ProjectErrorCode>>', () => {
  expectTypeOf<AtriumAPI['project']['getRecents']>()
    .returns.resolves.toEqualTypeOf<Result<RecentProject[], ProjectErrorCode>>();
});

// ---------------------------------------------------------------------------
// dialog namespace
// ---------------------------------------------------------------------------

test('AtriumAPI.dialog.openFolder returns Promise<Result<string | null, DialogErrorCode>>', () => {
  expectTypeOf<AtriumAPI['dialog']['openFolder']>()
    .returns.resolves.toEqualTypeOf<Result<string | null, DialogErrorCode>>();
});

// ---------------------------------------------------------------------------
// fileSync namespace
// ---------------------------------------------------------------------------

test('AtriumAPI.fileSync.startWatching returns Promise<Result<void, FileSyncErrorCode>>', () => {
  expectTypeOf<AtriumAPI['fileSync']['startWatching']>()
    .returns.resolves.toEqualTypeOf<Result<void, FileSyncErrorCode>>();
});

test('AtriumAPI.fileSync.stopWatching returns Promise<Result<void, FileSyncErrorCode>>', () => {
  expectTypeOf<AtriumAPI['fileSync']['stopWatching']>()
    .returns.resolves.toEqualTypeOf<Result<void, FileSyncErrorCode>>();
});

test('AtriumAPI.fileSync.onChanged accepts a ProjectState callback and returns an unsubscribe fn', () => {
  expectTypeOf<AtriumAPI['fileSync']['onChanged']>()
    .parameter(0)
    .toEqualTypeOf<(state: ProjectState) => void>();
  expectTypeOf<AtriumAPI['fileSync']['onChanged']>().returns.toEqualTypeOf<() => void>();
});

// ---------------------------------------------------------------------------
// terminal namespace
// ---------------------------------------------------------------------------

test('AtriumAPI.terminal.spawn returns Promise<Result<TerminalId, TerminalErrorCode>>', () => {
  expectTypeOf<AtriumAPI['terminal']['spawn']>()
    .returns.resolves.toEqualTypeOf<Result<TerminalId, TerminalErrorCode>>();
});

test('AtriumAPI.terminal.kill returns Promise<Result<void, TerminalErrorCode>>', () => {
  expectTypeOf<AtriumAPI['terminal']['kill']>()
    .returns.resolves.toEqualTypeOf<Result<void, TerminalErrorCode>>();
});

test('AtriumAPI.terminal.write is void', () => {
  expectTypeOf<AtriumAPI['terminal']['write']>().returns.toEqualTypeOf<void>();
});

test('AtriumAPI.terminal.resize is void', () => {
  expectTypeOf<AtriumAPI['terminal']['resize']>().returns.toEqualTypeOf<void>();
});

test('AtriumAPI.terminal.onData accepts id + ArrayBuffer callback and returns unsubscribe fn', () => {
  expectTypeOf<AtriumAPI['terminal']['onData']>()
    .parameter(0)
    .toEqualTypeOf<TerminalId>();
  expectTypeOf<AtriumAPI['terminal']['onData']>()
    .parameter(1)
    .toEqualTypeOf<(data: ArrayBuffer) => void>();
  expectTypeOf<AtriumAPI['terminal']['onData']>().returns.toEqualTypeOf<() => void>();
});

test('AtriumAPI.terminal.onExit accepts id + exit-code callback and returns unsubscribe fn', () => {
  expectTypeOf<AtriumAPI['terminal']['onExit']>()
    .parameter(0)
    .toEqualTypeOf<TerminalId>();
  expectTypeOf<AtriumAPI['terminal']['onExit']>()
    .parameter(1)
    .toEqualTypeOf<(code: number | null) => void>();
  expectTypeOf<AtriumAPI['terminal']['onExit']>().returns.toEqualTypeOf<() => void>();
});

// ---------------------------------------------------------------------------
// health namespace
// ---------------------------------------------------------------------------

test('AtriumAPI.health.checkClaude returns Promise<Result<HealthInfo, HealthErrorCode>>', () => {
  expectTypeOf<AtriumAPI['health']['checkClaude']>()
    .returns.resolves.toEqualTypeOf<Result<HealthInfo, HealthErrorCode>>();
});

// ---------------------------------------------------------------------------
// Window ambient augmentation
// ---------------------------------------------------------------------------

test('Window["atrium"] is typed as AtriumAPI', () => {
  // This assertion only compiles if the ambient Window augmentation from
  // src/preload/api.ts is visible in this tsconfig project.
  expectTypeOf<Window['atrium']>().toEqualTypeOf<AtriumAPI>();
});
