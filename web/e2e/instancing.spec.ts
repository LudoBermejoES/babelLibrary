import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('gallery 0 renders exactly 4 shelf-bay instances and 2 lamp instances', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const counts = await page.evaluate(() => window.__babel!.instanceCountsForGallery(0));
  expect(counts.shelves).toBe(4);
  expect(counts.lamps).toBe(2);
});

test('books rendered across all galleries (visited one at a time via streaming) match the fixture catalog size', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  // Only the current gallery + its neighbors are ever live at once (gallery
  // streaming, task 4.8) — walk every gallery as "current" in turn so each
  // one's books are counted exactly once, matching a full tour of the library.
  const { galleryCount, total } = await page.evaluate(() => {
    const babel = window.__babel!;
    const count = babel.galleryCount;
    let books = 0;
    for (let i = 0; i < count; i++) {
      babel.setCurrentGallery(i);
      books += babel.instanceCountsForGallery(i).books;
    }
    return { galleryCount: count, total: books };
  });

  expect(galleryCount).toBeGreaterThan(0);
  expect(total).toBe(9); // fixture catalog (data/books.sqlite) has 9 rows
});
