/**
 * No-backend E2E: an inquiry's listing name comes from the inquiry itself.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts.
 *
 * Verifies the inbox names the listing an inquiry is linked to even when the
 * separate listings request knows nothing about that listing (a host with more
 * listings than one page holds).
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubNoListings } from "./fixtures/emptyLists";
import { INQUIRY_SUMMARY } from "./fixtures/mockInquiry";

const LISTING_TITLE = "Room 75 - Garden Suite";

async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await stubNoListings(page);
  await page.route(/\/api\/inquiries(\?.*)?$/, (route, request: Request) =>
    request.method() === "GET"
      ? route.fulfill(
          json({
            items: [{ ...INQUIRY_SUMMARY, listing_id: "listing-75", listing_title: LISTING_TITLE }],
            total: 1,
            has_more: false,
          }),
        )
      : route.fallback(),
  );
}

test.describe("Inquiry listing names", () => {
  test("shows the linked listing's name when the listings request doesn't include it", async ({ page }) => {
    await plantAuth(page);
    await stubApi(page);

    await page.goto("/inquiries");

    await expect(page.getByText(LISTING_TITLE).locator("visible=true").first()).toBeVisible();
  });
});
