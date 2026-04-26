import { test, expect } from "./fixtures/auth";

test.describe("Layout — sidebar and content scrolling", () => {
  test("sidebar fills full viewport height on every page", async ({ authedPage: page }) => {
    const pages = ["/", "/transactions", "/documents", "/properties", "/tax-report", "/integrations", "/members"];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const sidebar = page.locator("aside").first();
      if (await sidebar.isVisible()) {
        const sidebarBox = await sidebar.boundingBox();
        const viewportHeight = page.viewportSize()?.height ?? 0;

        expect(sidebarBox, `Sidebar missing on ${path}`).toBeTruthy();
        expect(sidebarBox!.height).toBeGreaterThanOrEqual(viewportHeight - 1);
      }
    }
  });

  test("page body does not scroll vertically — content scrolls in container", async ({ authedPage: page }) => {
    const pages = ["/", "/transactions", "/documents", "/properties"];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const bodyClientHeight = await page.evaluate(() => document.body.clientHeight);

      expect(
        bodyScrollHeight,
        `Page-level vertical scroll detected on ${path} (scrollHeight=${bodyScrollHeight}, clientHeight=${bodyClientHeight})`,
      ).toBeLessThanOrEqual(bodyClientHeight + 1);
    }
  });

  test("sidebar bottom section stays visible without scrolling", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const userMenu = page.locator("aside").first().locator("button").last();
    if (await userMenu.isVisible()) {
      const box = await userMenu.boundingBox();
      const viewportHeight = page.viewportSize()?.height ?? 0;

      expect(box, "User menu not visible").toBeTruthy();
      expect(box!.y + box!.height, "User menu extends below viewport").toBeLessThanOrEqual(viewportHeight);
    }
  });

  test("no horizontal scroll on any page", async ({ authedPage: page }) => {
    const pages = ["/", "/transactions", "/documents", "/properties", "/tax-report", "/integrations"];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = page.viewportSize()?.width ?? 0;

      expect(
        bodyWidth,
        `Horizontal scroll detected on ${path}`,
      ).toBeLessThanOrEqual(viewportWidth);
    }
  });
});
