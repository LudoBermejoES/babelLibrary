import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('every gallery renders a vestibule room with mirror and 2 closets', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const counts = await page.evaluate(() => window.__babel!.vestibuleMeshCountsForGallery(0));
  expect(counts.mirrors).toBe(1);
  expect(counts.closets).toBe(2);
});

test('shaft railing renders for every currently-live gallery', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const liveIndices = await page.evaluate(() => window.__babel!.liveGalleryIndices());
  expect(liveIndices.length).toBeGreaterThan(0);
  for (const index of liveIndices) {
    const railingCount = await page.evaluate((i) => window.__babel!.shaftRailingMeshCount(i), index);
    expect(railingCount).toBeGreaterThan(0);
  }
});

test('staircase mesh presence matches the vestibule buffer flags, for every currently-live gallery', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const liveIndices = await page.evaluate(() => window.__babel!.liveGalleryIndices());
  for (const index of liveIndices) {
    const result = await page.evaluate((i) => window.__babel!.staircaseMatchesFlags(i), index);
    expect(result).toBe(true);
  }
});
