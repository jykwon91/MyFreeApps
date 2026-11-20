/**
 * No-backend E2E: a read-only viewer sees the calendar review queue but gets no
 * Add / Ignore / Dismiss actions; an owner still gets all three.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const ITEM_ID = "00000000-0000-0000-0000-0000000000e1";

const QUEUE_ITEM = {
  id: ITEM_ID,
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
});

function fulfillJson(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function openQueue(page: Page, role: OrgRole): Promise<string[]> {
  const writes: string[] = [];
  await stubWorkspaceShell(page, role);
  await page.route("**/api/properties", (route) => route.fulfill(fulfillJson([])));
  await page.route("**/api/listings?**", (route) =>
    route.fulfill(fulfillJson({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/calendar/events**", (route) => route.fulfill(fulfillJson([])));
  await page.route("**/api/calendar/review-queue**", async (route, request) => {
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: "Viewers have read-only access" }) });
      return;
    }
    const isCount = new URL(request.url()).pathname.endsWith("/count");
    await route.fulfill(fulfillJson(isCount ? 1 : [QUEUE_ITEM]));
  });
  await page.goto("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");
  await page.getByTestId("review-queue-badge-btn").click();
  await expect(page.getByTestId("review-queue-item")).toBeVisible({ timeout: 10000 });
  return writes;
}

test.describe("Calendar review queue by role (mocked, no backend)", () => {
  test("a viewer reads the item but has no Add, Ignore or Dismiss", async ({ page }) => {
    const writes = await openQueue(page, "viewer");
    await expect(page.getByTestId("review-queue-subject")).toContainText("John Smith");
    await expect(page.getByTestId("review-queue-add-btn")).toHaveCount(0);
    await expect(page.getByTestId("review-queue-ignore-btn")).toHaveCount(0);
    await expect(page.getByTestId("review-queue-dismiss-btn")).toHaveCount(0);
    expect(writes).toEqual([]);
  });

  test("an owner still gets Add, Ignore and Dismiss", async ({ page }) => {
    await openQueue(page, "owner");
    await expect(page.getByTestId("review-queue-add-btn")).toBeVisible();
    await expect(page.getByTestId("review-queue-ignore-btn")).toBeVisible();
    await expect(page.getByTestId("review-queue-dismiss-btn")).toBeVisible();
  });
});
