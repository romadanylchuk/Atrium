import { test, expect } from '@playwright/test';
import { launchApp, FIXTURE_PROJECT } from './helpers/launchApp';

test('Scenario 2 — Open project: gate dismisses, canvas renders ≥1 node', async () => {
  const { app, page } = await launchApp({ e2eFolder: FIXTURE_PROJECT });

  try {
    // Wait for the launch gate to appear first
    const gate = page.locator('[aria-modal="true"]');
    await expect(gate).toBeVisible({ timeout: 15_000 });

    // Click Open — ATRIUM_E2E_FOLDER causes the dialog stub to return the fixture path
    const openBtn = page.getByRole('button', { name: 'Open' });
    await expect(openBtn).toBeEnabled();
    await openBtn.click();

    // Gate should dismiss (MainShell replaces it)
    await expect(gate).not.toBeVisible({ timeout: 15_000 });

    // MainShell must be present
    const mainShell = page.locator('[data-testid="main-shell"]');
    await expect(mainShell).toBeVisible({ timeout: 10_000 });

    // React Flow renders nodes as elements with the react-flow__node class
    // There must be at least one node from our fixture project
    await expect(
      page.locator('.react-flow__node').first(),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
  }
});
