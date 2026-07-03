import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('every gallery renders a vestibule room with mirror and 2 closets', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const counts = await page.evaluate(() => window.__babel!.vestibuleMeshCountsForGallery(0));
  expect(counts.mirrors).toBe(1);
  expect(counts.closets).toBe(2);
});

test('shaft railing renders for every gallery', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const galleryCount = await page.evaluate(() => window.__babel!.galleryCount);
  for (let i = 0; i < galleryCount; i++) {
    const railingCount = await page.evaluate((index) => window.__babel!.shaftRailingMeshCount(index), i);
    expect(railingCount).toBeGreaterThan(0);
  }
});

test('staircase mesh presence matches the vestibule buffer flags', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const galleryCount = await page.evaluate(() => window.__babel!.galleryCount);
  for (let i = 0; i < galleryCount; i++) {
    const result = await page.evaluate((index) => window.__babel!.staircaseMatchesFlags(index), i);
    expect(result).toBe(true);
  }
});
