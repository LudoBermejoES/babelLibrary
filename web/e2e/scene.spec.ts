import { expect, test } from '@playwright/test';

test('renders a blank three.js scene with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  expect(errors).toEqual([]);
});
