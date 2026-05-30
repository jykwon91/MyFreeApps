import { test, expect, type Page } from "./fixtures/auth";
import { createWelcomeManual, deleteWelcomeManual } from "./fixtures/welcome-manual";

/**
 * Layout E2E for the Welcome Manuals list + detail pages (PR 4b).
 *
 * Verifies:
 *   1. The list skeleton has card/row slots (no layout shift), and the
 *      skeleton slot count is in the same ballpark as the loaded list.
 *   2. Mobile (375), tablet (768), desktop (1280) render both pages without
 *      horizontal overflow.
 *   3. Mobile viewport surfaces the card layout; desktop surfaces the table.
 *   4. The detail page skeleton renders while the manual loads.
 */

const MANUAL_COUNT = 3;

test.describe("Welcome Manuals layout (PR 4b)", () => {
  test("list skeleton card count is in the ballpark of the loaded card count on mobile", async ({
    authedPage: page,
    api,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    const runId = Date.now();
    const manualIds: string[] = [];
    try {
      // Block the list call so the skeleton stays visible long enough to count.
      await page.route("**/api/welcome-manuals**", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const navPromise = page.goto("/welcome-manuals");
      await expect(page.getByTestId("welcome-manuals-skeleton")).toBeVisible({ timeout: 5000 });

      const skeletonMobileList = page.locator(
        '[data-testid="welcome-manuals-skeleton"] ul.md\\:hidden li',
      );
      const skeletonCount = await skeletonMobileList.count();
      expect(skeletonCount).toBeGreaterThan(0);

      for (let i = 0; i < MANUAL_COUNT; i++) {
        const manual = await createWelcomeManual(api, {
          title: `E2E Layout Manual ${runId}-${i}`,
          seed_default_sections: false,
        });
        manualIds.push(manual.id);
      }
      await page.unroute("**/api/welcome-manuals**");
      await navPromise;
      await page.reload();
      await page.waitForLoadState("networkidle");

      const loadedMobileCards = page.locator('[data-testid="welcome-manuals-mobile"] li');
      const loadedCount = await loadedMobileCards.count();
      expect(loadedCount).toBeGreaterThanOrEqual(MANUAL_COUNT);

      expect(Math.abs(skeletonCount - loadedCount)).toBeLessThanOrEqual(4);
    } finally {
      for (const id of manualIds) await deleteWelcomeManual(api, id);
    }
  });

  test("list renders without horizontal scroll at mobile / tablet / desktop", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const manualIds: string[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        const manual = await createWelcomeManual(api, {
          title: `E2E Multi Layout ${runId}-${i}`,
          seed_default_sections: false,
        });
        manualIds.push(manual.id);
      }

      const viewports: ReadonlyArray<{ name: string; width: number; height: number }> = [
        { name: "mobile", width: 375, height: 800 },
        { name: "tablet", width: 768, height: 1024 },
        { name: "desktop", width: 1280, height: 900 },
      ];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/welcome-manuals");
        await page.waitForLoadState("networkidle");

        await expect(
          page.getByRole("heading", { name: "Welcome Manuals" }),
          `heading visible at ${vp.name}`,
        ).toBeVisible();

        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(
          bodyWidth,
          `Horizontal scroll at ${vp.name} (${vp.width}px) — bodyWidth=${bodyWidth}`,
        ).toBeLessThanOrEqual(vp.width + 1);
      }
    } finally {
      for (const id of manualIds) await deleteWelcomeManual(api, id);
    }
  });

  test("mobile hides the desktop table; desktop hides the mobile list", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const manual = await createWelcomeManual(api, {
      title: `E2E Toggle ${runId}`,
      seed_default_sections: false,
    });
    try {
      await assertOnlyMobileVisible(page, "mobile", 375, 800);
      await assertOnlyDesktopVisible(page, "desktop", 1280, 900);
    } finally {
      await deleteWelcomeManual(api, manual.id);
    }
  });

  test("detail page skeleton renders while the manual loads, then shows the header", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const manual = await createWelcomeManual(api, {
      title: `E2E Detail Layout ${runId}`,
      seed_default_sections: true,
    });
    try {
      // Block the detail call so the skeleton stays visible long enough to assert.
      await page.route(`**/api/welcome-manuals/${manual.id}`, async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      });
      const navPromise = page.goto(`/welcome-manuals/${manual.id}`);
      await expect(page.getByTestId("welcome-manual-detail-skeleton")).toBeVisible({
        timeout: 5000,
      });
      await page.unroute(`**/api/welcome-manuals/${manual.id}`);
      await navPromise;
      await page.waitForLoadState("networkidle");

      await expect(
        page.getByRole("heading", { name: `E2E Detail Layout ${runId}` }),
      ).toBeVisible();
      await expect(page.getByTestId("welcome-manual-header-card")).toBeVisible();

      // No horizontal overflow on the detail page either.
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const vw = page.viewportSize()?.width ?? 0;
      expect(bodyWidth).toBeLessThanOrEqual(vw + 1);
    } finally {
      await deleteWelcomeManual(api, manual.id);
    }
  });
});

async function assertOnlyMobileVisible(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/welcome-manuals");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByTestId("welcome-manuals-mobile"),
    `mobile list visible at ${name}`,
  ).toBeVisible();
  await expect(
    page.getByTestId("welcome-manuals-desktop"),
    `desktop table hidden at ${name}`,
  ).toBeHidden();
}

async function assertOnlyDesktopVisible(page: Page, name: string, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/welcome-manuals");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByTestId("welcome-manuals-desktop"),
    `desktop table visible at ${name}`,
  ).toBeVisible();
  await expect(
    page.getByTestId("welcome-manuals-mobile"),
    `mobile list hidden at ${name}`,
  ).toBeHidden();
}
