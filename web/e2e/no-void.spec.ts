import { expect, test } from '@playwright/test';
import type { SurveyView } from '../src/debug';

// The library is infinite: every sightline must land on geometry, never on
// void (design D7/D8, doc 09 §6). This gate stands in representative galleries
// on a multi-floor catalog, aims the camera down each of the four sightlines
// that historically revealed void, and asserts the void fraction stays under
// threshold. It is RED before the wall-3 replica / shaft-well / vertical-wrap
// work and GREEN after.
//
// surveyVoidFraction renders each frame against a bright magenta SENTINEL
// clear color and counts sentinel-colored pixels, so it measures genuine void
// (a sightline that hit no geometry) DIRECTLY — not darkness. This matters:
// production's clear color is the fog color, so a pixel-brightness test could
// not tell a fog-filled hole from real dark-but-lit geometry. A view full of
// geometry reads ~0 void; a genuine hole reads far higher.
const MAX_VOID = 0.02;

const VIEWS: SurveyView[] = ['vestibule', 'wall3', 'shaftUp', 'shaftDown'];

test('no sightline reveals black void — horizontal and vertical wrap all render geometry', async ({
  page,
}) => {
  await page.goto('/?e2e&e2eBookCount=3500');
  await page.waitForFunction(() => window.__babel !== undefined);

  const results = await page.evaluate((views) => {
    const babel = window.__babel!;
    const count = babel.galleryCount;

    // Pick representative galleries: one interior (has both floor neighbors if
    // possible), one top-floor (no floorAbove — exercises the upward wrap),
    // one bottom-floor (no floorBelow — exercises the downward wrap).
    let interior = 0;
    let topFloor = -1;
    let bottomFloor = -1;
    for (let i = 0; i < count; i++) {
      const above = babel.floorNeighborOf(i, 'above');
      const below = babel.floorNeighborOf(i, 'below');
      if (above !== null && below !== null && interior === 0) interior = i;
      if (above !== null && below === null && topFloor === -1) topFloor = i;
      if (below !== null && above === null && bottomFloor === -1) bottomFloor = i;
    }

    const targets = [interior, topFloor, bottomFloor].filter((i) => i >= 0);
    const out: Array<{ gallery: number; view: string; fraction: number }> = [];
    for (const gallery of targets) {
      for (const view of views) {
        out.push({ gallery, view, fraction: babel.surveyVoidFraction(gallery, view) });
      }
    }
    return { targets, out };
  }, VIEWS);

  expect(results.targets.length).toBeGreaterThan(0);
  const offenders = results.out.filter((r) => r.fraction > MAX_VOID);
  expect(
    offenders,
    `views exceeding ${MAX_VOID} void: ${JSON.stringify(offenders)}`,
  ).toEqual([]);
});
