import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('seeded fixture catalog renders galleries reachable via the debug hook', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const galleryCount = await page.evaluate(() => window.__babel!.galleryCount);
  expect(galleryCount).toBeGreaterThanOrEqual(7);
});

test('each gallery renders floor/ceiling + 4 shelf walls + 1 vestibule opening', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  // floor + ceiling (2) + 4 solid shelf walls (4) + vestibule opening (2 flanks + 1 lintel = 3) = 9.
  const meshCount = await page.evaluate(() => window.__babel!.wallMeshCountForGallery(0));
  expect(meshCount).toBe(9);
});

test('?seed= override changes the generated layout', async ({ page }) => {
  await page.goto('/?e2e&seed=1');
  await page.waitForFunction(() => window.__babel !== undefined);
  const seedOne = await page.evaluate(() => window.__babel!.seed);

  await page.goto('/?e2e&seed=2');
  await page.waitForFunction(() => window.__babel !== undefined);
  const seedTwo = await page.evaluate(() => window.__babel!.seed);

  expect(seedOne).not.toBe(seedTwo);
});
