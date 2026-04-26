import { test, expect } from '@playwright/test';
import { launchApp } from './helpers/launchApp';

test('Scenario 1 — Launch: health check passes, launcher renders with no recents', async () => {
  const { app, page } = await launchApp();

  try {
    // The launch gate is a dialog with aria-modal
    const gate = page.locator('[aria-modal="true"]');
    await expect(gate).toBeVisible({ timeout: 15_000 });

    // No recent projects yet — gate shows empty text
    await expect(page.getByText('No recent projects.')).toBeVisible();

    // Bottom health-line shows both dependencies resolved.
    // Scoped to the testid to avoid matching the DEPENDENCIES section's role="status" elements
    // (which also render claudeLine text while pluginStatus is still 'checking').
    const healthLine = page.getByTestId('launch-health-line');
    await expect(healthLine.getByText(/claude .* · healthy/)).toBeVisible({ timeout: 15_000 });
    await expect(healthLine.getByText(/architector .* · present/)).toBeVisible({ timeout: 15_000 });

    // Gate fully unlocked — Open button must be present and enabled (both dependencies satisfied)
    const openBtn = page.getByRole('button', { name: 'Open project…' });
    await expect(openBtn).toBeVisible();
    await expect(openBtn).toBeEnabled();
  } finally {
    await app.close();
  }
});
