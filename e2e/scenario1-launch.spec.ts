import { test, expect } from '@playwright/test';
import { launchApp } from './helpers/launchApp';

test('Scenario 1 — Launch: health check passes, launcher renders with no recents', async () => {
  const { app, page } = await launchApp();

  try {
    // The launch gate is a dialog with aria-modal
    const gate = page.locator('[aria-modal="true"]');
    await expect(gate).toBeVisible({ timeout: 15_000 });

    // Open button must be present and enabled
    const openBtn = page.getByRole('button', { name: 'Open' });
    await expect(openBtn).toBeVisible();
    await expect(openBtn).toBeEnabled();

    // No recent projects yet — RecentsList shows empty text
    await expect(page.getByText('No recent projects.')).toBeVisible();

    // Health check must resolve to ok (fake-claude prints a version matching \d+\.\d+\.\d+)
    // HealthSection renders "Claude <version> found." when ok
    await expect(page.getByText(/Claude .* found\./)).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
  }
});
