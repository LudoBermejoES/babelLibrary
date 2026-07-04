import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

// Regression: the ?e2e setCurrentGallery hook used to call streamer.update()
// directly and leave PlayerController.tracked stale, so the streamer and the
// player disagreed on the current gallery — the next movement tick then
// collided against a disposed gallery and re-ripped the scene. The hook must
// route through the player so tracking, the streamer, and the collider cache
// stay in sync.
test('setCurrentGallery keeps the player tracked gallery in sync with the streamer', async ({ page }) => {
  await page.goto('/?e2e&e2eBookCount=3000');
  await page.waitForFunction(() => window.__babel !== undefined);

  const galleryCount = await page.evaluate(() => window.__babel!.galleryCount);
  // Jump to a gallery far from spawn (non-adjacent), where a
  // neighbor-only retrack could never converge.
  const target = Math.min(galleryCount - 1, 10);

  const result = await page.evaluate((t) => {
    const babel = window.__babel!;
    babel.setCurrentGallery(t);
    return {
      tracked: babel.trackedGalleryIndex(),
      live: babel.liveGalleryIndices(),
    };
  }, target);

  expect(result.tracked).toBe(target);
  expect(result.live).toContain(target);
});
