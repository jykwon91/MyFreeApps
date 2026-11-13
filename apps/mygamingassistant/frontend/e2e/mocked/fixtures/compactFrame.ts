/**
 * Layout checks for the compact frame (?compact=1): the shell-less window whose
 * own <main> is the page's one landmark and its only scroller. For E2E tests only.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { FrameMetrics } from "../types/FrameMetrics";

function measureFrame(page: Page): Promise<FrameMetrics> {
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const rect = main.getBoundingClientRect();
    const nestedScrollers = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el !== main && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
      .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}`);
    return {
      main: { width: rect.width, height: rect.height, scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
      documentScrollWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      windowScrollY: window.scrollY,
      nestedScrollers,
    };
  });
}

/**
 * The page is the compact frame: no shell, one <main> filling the window, nothing
 * wider than the window (in the frame or the document), and no scroller but <main>.
 */
export async function expectCompactFrame(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  await expect(page.locator("main")).toHaveCount(1);
  const frame = await measureFrame(page);
  expect(frame.main.width, "frame fills the window width").toBe(frame.windowWidth);
  expect(frame.main.height, "frame fills the window height").toBe(frame.windowHeight);
  expect(frame.main.scrollWidth, "frame has no horizontal overflow").toBeLessThanOrEqual(frame.main.clientWidth);
  expect(frame.documentScrollWidth, "document has no horizontal overflow").toBeLessThanOrEqual(frame.windowWidth);
  expect(frame.windowScrollY, "the window itself does not scroll").toBe(0);
  expect(frame.nestedScrollers, "no second scrollbar inside the frame").toEqual([]);
}

/**
 * The page is taller than the frame, and the frame (not the window) scrolls to bring `target` into view:
 * scrolled to its end, `target` is in view, <main> has moved and the window has not.
 */
export async function expectFrameScrollsTo(page: Page, target: Locator): Promise<void> {
  const main = page.getByRole("main");
  const size = await main.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(size.scrollHeight, "the page is taller than the frame").toBeGreaterThan(size.clientHeight);
  await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(target).toBeInViewport();
  expect(await main.evaluate((el) => el.scrollTop), "the frame scrolled").toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY), "the window did not").toBe(0);
}
