import { expect, test } from '@playwright/test';

// Headless Chromium cannot grant real Pointer Lock (the API silently never
// resolves — no error, `document.pointerLockElement` just stays null
// forever), so the actual lock-engaged / WASD-movement / Esc-releases-lock
// behavior can't be asserted here. That's covered by the doc 09 manual QA
// checklist instead (see the "Pointer lock" row). What IS real and
// testable headless: the overlay shows at boot, and clicking it genuinely
// calls `requestPointerLock()` on the canvas — verified by monkey-patching
// the method before the click, in the same execution context so the patch
// persists.
test('the enter overlay is shown at boot and clicking it calls requestPointerLock', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('canvas');

  await expect(page.getByTestId('enter-overlay')).toBeVisible();
  await expect(page.getByTestId('enter-overlay')).toContainText(/click to enter/i);

  await page.evaluate(() => {
    const original = HTMLElement.prototype.requestPointerLock;
    (window as unknown as { __calls: number }).__calls = 0;
    HTMLElement.prototype.requestPointerLock = function (this: HTMLElement, ...args: unknown[]) {
      (window as unknown as { __calls: number }).__calls++;
      return original.apply(this, args as never);
    };
  });

  await page.getByTestId('enter-overlay').click();

  const calls = await page.evaluate(() => (window as unknown as { __calls: number }).__calls);
  expect(calls).toBeGreaterThan(0);
});
