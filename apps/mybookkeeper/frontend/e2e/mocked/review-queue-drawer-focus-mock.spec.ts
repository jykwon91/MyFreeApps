/**
 * No-backend E2E for keyboard and screen-reader handling of the calendar's
 * booking review queue drawer.
 *
 * The drawer was a plain overlay: focus stayed on the page behind it, Tab
 * walked out into that page and closing left focus nowhere. It is now a
 * modal dialog.
 *
 * Verifies, driven by keyboard only:
 *   - It opens from the queue badge, is announced as a dialog named "Booking
 *     review queue", the page behind is hidden from screen readers, and focus
 *     moves into it.
 *   - Tabbing round it many times never leaves it.
 *   - Escape closes it and focus goes back to the badge.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const QUEUE_ITEM = {
  id: "00000000-0000-0000-0000-0000000000e1",
  email_message_id: "msg-airbnb-1",
  source_channel: "airbnb",
  parsed_payload: {
    source_channel: "airbnb",
    source_listing_id: "12345",
    guest_name: "John Smith",
    check_in: "2026-06-05",
    check_out: "2026-06-10",
    total_price: "$425.00",
    raw_subject: "Reservation confirmed - John Smith",
  },
  status: "pending",
  created_at: "2026-05-03T00:00:00Z",
};

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) => route.fulfill(json([])));
  await page.route("**/api/listings?**", (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  await page.route("**/api/calendar/events**", (route) => route.fulfill(json([])));
  await page.route("**/api/calendar/review-queue**", (route, request) => {
    const isCount = new URL(request.url()).pathname.endsWith("/count");
    return route.fulfill(json(isCount ? 1 : [QUEUE_ITEM]));
  });
});

test.describe("Booking review queue drawer — focus and Escape", () => {
  test("focus moves in, Tab stays inside, Escape closes and focus returns to the badge", async ({ page }) => {
    await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
    const opener = page.getByTestId("review-queue-badge-btn");
    await opener.focus({ timeout: 15000 });
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Booking review queue" });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("review-queue-item")).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(0);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
        `Tab ${i + 1} moved focus out of the drawer`,
      ).toBe(true);
    }
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("review-queue-drawer")).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("a click on the backdrop closes it", async ({ page }) => {
    await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
    await page.getByTestId("review-queue-badge-btn").click({ timeout: 15000 });
    await expect(page.getByTestId("review-queue-drawer")).toBeVisible();

    await page.mouse.click(5, 450);

    await expect(page.getByTestId("review-queue-drawer")).toBeHidden();
  });
});
