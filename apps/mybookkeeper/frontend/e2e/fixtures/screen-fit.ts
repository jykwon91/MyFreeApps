import { expect, type Locator, type Page } from "@playwright/test";

/** Waits until the element lies within the first ``width`` pixels of the page. */
export async function expectWithinWidth(element: Locator, width: number): Promise<void> {
  await expect(async () => {
    const box = await element.boundingBox();
    if (!box) throw new Error("the element has no layout box");
    expect(Math.round(box.x)).toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(width);
  }).toPass({ timeout: 5000 });
}

/** Waits until the page has nothing wider than ``width``, so no sideways scroll. */
export async function expectNoSidewaysScroll(page: Page, width: number): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 5000 })
    .toBeLessThanOrEqual(width);
}

/** Waits until the element is a bottom sheet: full width, on the bottom edge, below the top. */
export async function expectBottomSheet(element: Locator, viewport: { width: number; height: number }): Promise<void> {
  await expect(async () => {
    const box = await element.boundingBox();
    if (!box) throw new Error("the element has no layout box");
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(viewport.width);
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
    expect(Math.round(box.y)).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
}
