import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('gallery 0 renders exactly 4 shelf-bay instances and 2 lamp instances', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const counts = await page.evaluate(() => window.__babel!.instanceCountsForGallery(0));
  expect(counts.shelves).toBe(4);
  expect(counts.lamps).toBe(2);
});

test('books rendered across all galleries match the fixture catalog size', async ({ page }) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const { galleryCount, total } = await page.evaluate(() => {
    const count = window.__babel!.galleryCount;
    let books = 0;
    for (let i = 0; i < count; i++) {
      books += window.__babel!.instanceCountsForGallery(i).books;
    }
    return { galleryCount: count, total: books };
  });

  expect(galleryCount).toBeGreaterThan(0);
  expect(total).toBe(9); // fixture catalog (data/books.sqlite) has 9 rows
});
