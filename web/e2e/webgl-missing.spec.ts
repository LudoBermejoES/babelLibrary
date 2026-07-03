import { expect, test } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--disable-webgl', '--disable-webgl2'],
  },
});

test('shows an error panel instead of a blank canvas when WebGL2 is unavailable', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('webgl-error')).toBeVisible();
  await expect(page.getByTestId('webgl-error')).toContainText(/webgl/i);
  await expect(page.locator('canvas')).toHaveCount(0);
});
