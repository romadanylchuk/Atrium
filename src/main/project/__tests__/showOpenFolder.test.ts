/**
 * Tests for src/main/project/showOpenFolder.ts
 *
 * Mocks Electron's dialog module. Covers:
 * - User cancels (canceled: true) → Result.ok(null)
 * - User picks a directory → Result.ok(path)
 * - API throws → Result.err(DIALOG_FAILED)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DialogErrorCode } from '@shared/errors';

// ---------------------------------------------------------------------------
// Mock electron before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: class MockBrowserWindow {},
}));

// Import after the mock is set up
import { showOpenFolder } from '../showOpenFolder';
import { dialog } from 'electron';

// Use vi.mocked on the whole object so TypeScript knows the methods are vi.Mock types.
const mockedDialog = vi.mocked(dialog);

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('showOpenFolder', () => {
  it('returns Result.ok(null) when user cancels (canceled: true)', async () => {
    mockedDialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await showOpenFolder(null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });

  it('returns Result.ok(null) when filePaths is empty and canceled is false', async () => {
    mockedDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });

    const result = await showOpenFolder(null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });

  it('returns Result.ok(path) when user picks a directory', async () => {
    const pickedPath = '/home/user/my-project';
    mockedDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [pickedPath] });

    const result = await showOpenFolder(null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBe(pickedPath);
  });

  it('returns Result.err(DIALOG_FAILED) when dialog API throws', async () => {
    mockedDialog.showOpenDialog.mockRejectedValue(new Error('OS dialog unavailable'));

    const result = await showOpenFolder(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(DialogErrorCode.DIALOG_FAILED);
    expect(result.error.message).toContain('OS dialog unavailable');
  });
});
