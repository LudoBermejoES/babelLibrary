import { expect, test } from '@playwright/test';

// Boot has genuinely failable steps (catalog fetch, wasm init). A failure
// must never leave a silent black canvas — same graceful-degradation rule
// as the WebGL2-missing path.
test('a failed catalog fetch shows an error panel instead of a silent black canvas', async ({ page }) => {
  await page.route('**/api/books', (route) => route.fulfill({ status: 500, body: 'boom' }));

  await page.goto('/');

  await expect(page.getByTestId('boot-error')).toBeVisible();
  await expect(page.getByTestId('boot-error')).toContainText(/could not load/i);
});
