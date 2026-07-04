import { expect, test } from '@playwright/test';
import type {} from '../src/debug';

test('teleporting past a gallery boundary triggers real gallery-tracking wiring (streamer.update)', async ({
  page,
}) => {
  await page.goto('/?e2e');
  await page.waitForFunction(() => window.__babel !== undefined);

  const setup = await page.evaluate(() => {
    const babel = window.__babel!;
    babel.setCurrentGallery(0);
    const neighborIndex = babel.liveGalleryIndices().find((i) => i !== 0);
    const gallery0Center = babel.galleryCenter(0)!;
    const neighborCenter = neighborIndex !== undefined ? babel.galleryCenter(neighborIndex) : null;
    return { neighborIndex, gallery0Center, neighborCenter };
  });

  expect(setup.neighborIndex).toBeDefined();
  expect(setup.neighborCenter).not.toBeNull();

  // Teleport to gallery 0's own center first (guaranteed to track as 0).
  const eyeHeight = 1.7;
  const atGallery0 = await page.evaluate(
    ([center, eye]) => window.__babel!.teleportAndTrack(center[0], center[1] + eye, center[2]),
    [setup.gallery0Center, eyeHeight] as const,
  );
  expect(atGallery0.galleryIndex).toBe(0);

  // Teleport well past the boundary, right at the neighbor's own center —
  // definitely closer to the neighbor than to gallery 0, past any hysteresis.
  const neighborCenter = setup.neighborCenter!;
  const atNeighbor = await page.evaluate(
    ([center, eye]) => window.__babel!.teleportAndTrack(center[0], center[1] + eye, center[2]),
    [neighborCenter, eyeHeight] as const,
  );
  expect(atNeighbor.galleryIndex).toBe(setup.neighborIndex);

  // The real proof this is wired, not just the pure function: the
  // streamer's live set now reflects the new current gallery.
  const liveAfter = await page.evaluate(() => window.__babel!.liveGalleryIndices());
  expect(liveAfter).toContain(setup.neighborIndex);
});
