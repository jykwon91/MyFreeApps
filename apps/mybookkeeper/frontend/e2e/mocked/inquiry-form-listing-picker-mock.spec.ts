/**
 * No-backend E2E: the New Inquiry form can link any listing, not just the first page of them.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts.
 *
 * Also verifies a field's error is tied to its input (aria-invalid + described by the message).
 *
 * Verifies a host with more listings than one page holds loads the next page with Load more, picks a
 * listing from it, and the inquiry is created linked to that listing.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { INQUIRY_SUMMARY } from "./fixtures/mockInquiry";

function listing(n: number) {
  return {
    id: `00000000-0000-0000-0000-0000000010${n}`,
    title: `Room ${n}`,
    status: "active",
    room_type: "private_room",
    monthly_rate: "1500.00",
    property_id: "00000000-0000-0000-0000-000000000099",
    created_at: "2026-01-01T00:00:00Z",
    slug: `room-${n}`,
  };
}

async function stubApi(page: Page): Promise<{ createdBodies: Record<string, unknown>[] }> {
  const createdBodies: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/listings(\?.*)?$/, (route, request: Request) => {
    const offset = Number(new URL(request.url()).searchParams.get("offset") ?? 0);
    return route.fulfill(
      json(
        offset === 0
          ? { items: [listing(1), listing(2)], total: 3, has_more: true }
          : { items: [listing(3)], total: 3, has_more: false },
      ),
    );
  });
  await page.route(/\/api\/inquiries(\?.*)?$/, (route, request: Request) => {
    if (request.method() === "POST") {
      createdBodies.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill(json({ ...INQUIRY_SUMMARY, id: "00000000-0000-0000-0000-0000000000ff" }, 201));
    }
    return route.fulfill(json({ items: [], total: 0, has_more: false }));
  });
  return { createdBodies };
}

test.describe("New Inquiry listing picker", () => {
  test("links an inquiry to a listing past the first page", async ({ page }) => {
    await plantAuth(page);
    const { createdBodies } = await stubApi(page);

    await page.goto("/inquiries");
    await page.getByTestId("new-inquiry-button").locator("visible=true").first().click();

    const select = page.getByTestId("inquiry-form-listing");
    await expect(select.locator("option", { hasText: "Room 2" })).toHaveCount(1);
    await expect(select.locator("option", { hasText: "Room 3" })).toHaveCount(0);

    await page.getByTestId("load-more-button").click();
    await expect(select.locator("option", { hasText: "Room 3" })).toHaveCount(1);
    await select.selectOption({ label: "Room 3" });

    await page.getByTestId("inquiry-form-name").fill("Pat Guest");
    await page.getByTestId("inquiry-form-submit").click();

    await expect.poll(() => createdBodies.length).toBe(1);
    expect(createdBodies[0]).toMatchObject({ listing_id: listing(3).id, inquirer_name: "Pat Guest" });
  });

  test("a missing name is announced on the name field", async ({ page }) => {
    await plantAuth(page);
    await stubApi(page);

    await page.goto("/inquiries");
    await page.getByTestId("new-inquiry-button").locator("visible=true").first().click();
    await page.getByTestId("inquiry-form-submit").click();

    const name = page.getByTestId("inquiry-form-name");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const errorId = await name.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    await expect(page.locator(`[id="${errorId}"]`)).toHaveText(/\S/);
  });
});
