import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('a gallery with a generated floor-below counterpart shows it through the shaft as a lightweight glimpse', async ({
  page,
}) => {
  await page.goto('/?e2e&e2eBookCount=3500');
  await page.waitForFunction(() => window.__babel !== undefined);

  const result = await page.evaluate(() => {
    const babel = window.__babel!;
    const count = babel.galleryCount;
    for (let i = 0; i < count; i++) {
      const below = babel.floorNeighborOf(i, 'below');
      if (below !== null) {
        babel.setCurrentGallery(i);
        return { found: true, glimpseExists: babel.shaftGlimpseExists(below) };
      }
    }
    return { found: false, glimpseExists: false };
  });

  expect(result.found).toBe(true);
  expect(result.glimpseExists).toBe(true);
});

// NOTE: this asserts the *current* pre-wrap behavior (a gallery with no
// generated floor-below has no down-glimpse). Task 3.4 (vertical visual
// wrap) will invert this — the bottom floor will show the wrapped top
// floor's glimpse — and this test will be replaced by the no-void survey.
test('a gallery with no floor-below has no down-glimpse (pre-wrap behavior)', async ({ page }) => {
  await page.goto('/?e2e&e2eBookCount=3500');
  await page.waitForFunction(() => window.__babel !== undefined);

  const result = await page.evaluate(() => {
    const babel = window.__babel!;
    const count = babel.galleryCount;
    for (let i = 0; i < count; i++) {
      if (babel.floorNeighborOf(i, 'below') === null && babel.floorNeighborOf(i, 'above') !== null) {
        // A top-floor gallery: has an upward link but no downward one.
        babel.setCurrentGallery(i);
        // Its own gallery is fully built (a glimpse group is only for
        // NEIGHBORS), and there is no floor-below index to have glimpsed.
        return { found: true, ownGalleryLive: babel.liveGalleryIndices().includes(i) };
      }
    }
    return { found: false, ownGalleryLive: false };
  });

  expect(result.found).toBe(true);
  expect(result.ownGalleryLive).toBe(true);
});

test('walking into a shaft-glimpse gallery upgrades it to a fully-built gallery', async ({ page }) => {
  await page.goto('/?e2e&e2eBookCount=3500');
  await page.waitForFunction(() => window.__babel !== undefined);

  const result = await page.evaluate(() => {
    const babel = window.__babel!;
    const count = babel.galleryCount;
    for (let i = 0; i < count; i++) {
      const below = babel.floorNeighborOf(i, 'below');
      if (below !== null) {
        babel.setCurrentGallery(i);
        const glimpseBefore = babel.shaftGlimpseExists(below);
        babel.setCurrentGallery(below);
        const glimpseAfter = babel.shaftGlimpseExists(below);
        const wallCountAfter = babel.wallMeshCountForGallery(below);
        return { found: true, glimpseBefore, glimpseAfter, wallCountAfter };
      }
    }
    return { found: false, glimpseBefore: false, glimpseAfter: true, wallCountAfter: 0 };
  });

  expect(result.found).toBe(true);
  expect(result.glimpseBefore).toBe(true);
  expect(result.glimpseAfter).toBe(false);
  expect(result.wallCountAfter).toBeGreaterThan(0);
});
