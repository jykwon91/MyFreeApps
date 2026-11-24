import { expect, type Page } from "@playwright/test";

export const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
// The content area at 1440px is wider than this; a max-w-3xl column is 768px.
const MIN_PAGE_WIDTH = 1000;

/** The page's title row spans the content area instead of a narrow column on the left. */
export async function expectFullWidthPage(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  const titleRow = await heading.locator("xpath=../..").boundingBox();
  expect(titleRow, "the page title row should be on screen").not.toBeNull();
  expect(titleRow!.width).toBeGreaterThanOrEqual(MIN_PAGE_WIDTH);
}
