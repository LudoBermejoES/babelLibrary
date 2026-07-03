import { expect, test } from '@playwright/test';

test('dev page serves', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle('babelLibrary');
});
