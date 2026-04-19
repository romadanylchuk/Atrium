import { test, expect } from '@playwright/test';
import { launchApp, FIXTURE_PROJECT } from './helpers/launchApp';

test('Scenario 3 — Terminal: spawn, receive output, kill, close', async () => {
  const { app, page } = await launchApp({ e2eFolder: FIXTURE_PROJECT });

  try {
    // --- Open the fixture project first (mirrors Scenario 2) ---
    const gate = page.locator('[aria-modal="true"]');
    await expect(gate).toBeVisible({ timeout: 15_000 });

    const openBtn = page.getByRole('button', { name: 'Open' });
    await expect(openBtn).toBeEnabled();
    await openBtn.click();

    // Wait for MainShell to appear
    const mainShell = page.locator('[data-testid="main-shell"]');
    await expect(mainShell).toBeVisible({ timeout: 15_000 });

    // --- Click Explore (no node selected → nodes=[]) ---
    const exploreBtn = page.locator('[data-testid="toolbar-btn-explore"]');
    await expect(exploreBtn).toBeEnabled({ timeout: 5_000 });
    await exploreBtn.click();

    // --- Terminal modal must appear ---
    const terminalModal = page.locator('[data-testid="terminal-modal"]');
    await expect(terminalModal).toBeVisible({ timeout: 10_000 });

    // xterm container must be present inside the modal
    const xtermContainer = page.locator('[data-testid="xterm-container"]');
    await expect(xtermContainer).toBeVisible();

    // --- Wait for the fake claude to emit HELLO_ATRIUM ---
    // Poll the __e2e_terminalOutput global that TerminalModal accumulates.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as Record<string, unknown>)['__e2e_terminalOutput'] as string ?? '',
          ),
        { timeout: 10_000, intervals: [300] },
      )
      .toContain('HELLO_ATRIUM');

    // --- Kill the terminal ---
    const killBtn = page.getByRole('button', { name: 'Kill terminal' });
    await expect(killBtn).toBeVisible();
    await killBtn.click();

    // After kill, the process exits and terminal transitions to 'exited'
    // The Close button appears
    const closeBtn = page.getByRole('button', { name: 'Close terminal' });
    await expect(closeBtn).toBeEnabled({ timeout: 10_000 });

    // --- Close the terminal ---
    await closeBtn.click();

    // Modal unmounts
    await expect(terminalModal).not.toBeVisible({ timeout: 5_000 });

    // Canvas (MainShell) is still visible
    await expect(mainShell).toBeVisible();
  } finally {
    await app.close();
  }
});
