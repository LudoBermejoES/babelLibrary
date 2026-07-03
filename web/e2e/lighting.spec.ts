import { expect, type Page, test } from '@playwright/test';

// Qualitative, spot-checked per doc 05/spec ("insufficient, dim" is an
// intent, not a hard threshold): screenshot the rendered scene and check
// average luminance. Placeholder lamp fixtures are emissive (they glow
// independent of scene lighting), so an absolute floor alone doesn't prove
// the ambient/point lights/fog are wired in — the real assertion is that
// disabling scene lighting measurably darkens the frame relative to the
// normal boot, while the normal boot still stays well short of a brightly
// lit look (the "insufficient" atmosphere, not merely "not pitch black").
async function averageLuminance(page: Page): Promise<number> {
  const screenshot = await page.locator('canvas').screenshot();
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count++;
    }
    return total / count / 255;
  }, screenshot.toString('base64'));
}

test('scene lighting measurably brightens the frame over unlit geometry, while staying dim overall', async ({
  page,
}) => {
  await page.goto('/?e2e&noLighting=1');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(300);
  const unlit = await averageLuminance(page);

  await page.goto('/');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(300);
  const lit = await averageLuminance(page);

  expect(lit).toBeGreaterThan(unlit); // ambient + point lights are doing something
  expect(lit).toBeLessThan(0.5); // "insufficient" per Borges — not brightly lit
});
