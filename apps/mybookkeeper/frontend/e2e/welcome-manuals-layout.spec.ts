import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { createWelcomeManual, deleteWelcomeManual } from "./fixtures/welcome-manual";
import { holdRequests } from "./fixtures/hold-requests";

/**
 * Layout E2E for the Welcome Manuals list + detail pages (PR 4b).
 *
 * Verifies:
 *   1. The list skeleton has card slots the same size as the loaded cards
 *      (no layout shift when the list arrives).
 *   2. Mobile (375), tablet (768), desktop (1280) render both pages without
 *      horizontal overflow.
 *   3. Mobile viewport surfaces the card layout; desktop surfaces the table.
 *   4. The detail page skeleton renders while the manual loads.
 */

const MANUAL_COUNT = 3;
const LAYOUT_SHIFT_TOLERANCE_PX = 2;

test.describe("Welcome Manuals layout (PR 4b)", () => {
  test("list skeleton cards are the size of the loaded cards on mobile", async ({
    authedPage: page,
    api,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    // Short enough to stay on one line at 375px, like a real manual title.
    const titlePrefix = `E2E Shift ${Date.now() % 100000}-`;
    const manualIds: string[] = [];
    try {
      for (let i = 0; i < MANUAL_COUNT; i++) {
        const manual = await createWelcomeManual(api, {
          title: `${titlePrefix}${i}`,
          seed_default_sections: false,
        });
        manualIds.push(manual.id);
      }

      const release = await holdRequests(page, (url) => url.pathname === "/api/welcome-manuals");
      await page.goto("/welcome-manuals");
      await expect(page.getByTestId("welcome-manuals-skeleton")).toBeVisible({ timeout: 5000 });

      const skeletonCards = page.locator('[data-testid="welcome-manuals-skeleton"] ul.md\\:hidden li');
      expect(await skeletonCards.count()).toBeGreaterThan(0);
      const skeletonBox = await skeletonCards.first().boundingBox();
      expect(skeletonBox, "skeleton card has a box").not.toBeNull();

      release();
      // The list is shared with other specs, so compare card size rather than card count.
      const ourCards = page
        .locator('[data-testid="welcome-manuals-mobile"] li')
        .filter({ hasText: titlePrefix });
      await expect(ourCards).toHaveCount(MANUAL_COUNT);
      const loadedBox = await ourCards.first().boundingBox();
      expect(loadedBox, "loaded card has a box").not.toBeNull();
      expect(skeletonBox!.height).toBeGreaterThan(0);
      expect(Math.abs(skeletonBox!.height - loadedBox!.height)).toBeLessThanOrEqual(LAYOUT_SHIFT_TOLERANCE_PX);
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
      const release = await holdRequests(page, (url) => url.pathname === `/api/welcome-manuals/${manual.id}`);
      await page.goto(`/welcome-manuals/${manual.id}`);
      await expect(page.getByTestId("welcome-manual-detail-skeleton")).toBeVisible({
        timeout: 5000,
      });
      release();

      // The guest preview below repeats the title, so look in the header card.
      const header = page.getByTestId("welcome-manual-header-card");
      await expect(header.getByRole("heading", { name: `E2E Detail Layout ${runId}` })).toBeVisible();
      await expect(page.getByTestId("welcome-manual-detail-skeleton")).toHaveCount(0);

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
