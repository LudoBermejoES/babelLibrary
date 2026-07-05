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

  // floor + ceiling + shaft well (3) + 4 solid shelf walls (4) + vestibule
  // opening (2 flanks + 1 lintel = 3) = 10. The shaft well is the tall
  // inner cylinder that stops the vertical shaft sightline from seeing
  // through the aligned floor holes into void (design D8 / no-void gate).
  const meshCount = await page.evaluate(() => window.__babel!.wallMeshCountForGallery(0));
  expect(meshCount).toBe(10);
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
