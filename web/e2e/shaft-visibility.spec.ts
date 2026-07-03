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

test('a gallery with no floor-below shows no shaft glimpse below it', async ({ page }) => {
  await page.goto('/?e2e&e2eBookCount=3500');
  await page.waitForFunction(() => window.__babel !== undefined);

  const result = await page.evaluate(() => {
    const babel = window.__babel!;
    const count = babel.galleryCount;
    for (let i = 0; i < count; i++) {
      const below = babel.floorNeighborOf(i, 'below');
      const above = babel.floorNeighborOf(i, 'above');
      if (below === null) {
        babel.setCurrentGallery(i);
        // No floor-below link at all for this gallery: nothing should ever
        // claim to be its "shaft-glimpse-below" — there is no such index.
        return { found: true, hasAbove: above !== null };
      }
    }
    return { found: false, hasAbove: false };
  });

  expect(result.found).toBe(true);
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
