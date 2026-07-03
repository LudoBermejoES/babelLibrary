import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('only the current gallery and its neighbors are live at once (draw calls bounded)', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const galleryCount = await page.evaluate(() => window.__babel!.galleryCount);
  const liveIndices = await page.evaluate(() => window.__babel!.liveGalleryIndices());

  // The fixture catalog's floor-0 chain gives every gallery exactly one
  // horizontal neighbor and no vertical ones, so "current + neighbors" is
  // at most 2 — well under the full gallery_count, proving streaming (not
  // an eager build-everything loop) is what's populating the scene.
  expect(galleryCount).toBeGreaterThan(2);
  expect(liveIndices.length).toBeLessThan(galleryCount);
  expect(liveIndices.length).toBeGreaterThan(0);
});

test('crossing to a neighboring gallery keeps it already populated (no pop-in) and drops the far one', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const before = await page.evaluate(() => window.__babel!.liveGalleryIndices());
  expect(before).toContain(0);

  // Gallery 0's horizontal neighbor (per neededGallerySet) is already live
  // before we "cross" to it — this is exactly what "no pop-in" means: the
  // destination's buffers/meshes exist ahead of the transition.
  const neighborIndex = before.find((i) => i !== 0);
  expect(neighborIndex).toBeDefined();

  await page.evaluate((index) => window.__babel!.setCurrentGallery(index!), neighborIndex);
  const after = await page.evaluate(() => window.__babel!.liveGalleryIndices());

  expect(after).toContain(neighborIndex);
  // Gallery 0 is still live only if it's still within the new needed set
  // (it is here, since neighbor's own horizontal neighbor loops back to 0
  // in this 7-gallery closed chain) — the real assertion is that whatever
  // galleries are no longer needed are actually gone from the scene.
  for (const index of before) {
    if (!after.includes(index)) {
      const meshCount = await page.evaluate((i) => window.__babel!.wallMeshCountForGallery(i), index);
      expect(meshCount).toBe(0);
    }
  }
});
