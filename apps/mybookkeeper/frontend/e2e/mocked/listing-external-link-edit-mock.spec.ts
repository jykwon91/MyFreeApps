/**
 * No-backend E2E: editing one of several links to other sites.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts.
 *
 * Verifies that clicking Edit on one link and then Edit on another (without closing the
 * form) shows the second link's values and saves them to the second link, never
 * overwriting it with the first link's values.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { LISTING, LISTING_ID, LISTING_SUMMARY } from "./fixtures/mockListing";

const AIRBNB_LINK = {
  id: "ext-2", listing_id: LISTING_ID, source: "Airbnb", external_id: "AB-999",
  external_url: "https://airbnb.com/rooms/999", created_at: "2026-01-01T00:00:00Z",
};
const TWO_LINK_LISTING = { ...LISTING, external_ids: [...LISTING.external_ids, AIRBNB_LINK] };

async function stubApi(page: Page): Promise<Request[]> {
  const patches: Request[] = [];
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/listings(\?.*)?$/, (route, request: Request) =>
    request.method() === "GET"
      ? route.fulfill(json({ items: [LISTING_SUMMARY], total: 1, has_more: false }))
      : route.fallback(),
  );
  await page.route(`**/api/listings/${LISTING_ID}`, (route, request: Request) =>
    request.method() === "GET" ? route.fulfill(json(TWO_LINK_LISTING)) : route.fallback(),
  );
  await page.route(`**/api/listings/${LISTING_ID}/external-ids/*`, (route, request: Request) => {
    if (request.method() !== "PATCH") return route.fallback();
    patches.push(request);
    return route.fulfill(json({ ...AIRBNB_LINK, ...request.postDataJSON() }));
  });
  return patches;
}

test.describe("Editing links to other sites", () => {
  test("switching from one link's Edit to another's edits the second link", async ({ page }) => {
    await plantAuth(page);
    const patches = await stubApi(page);

    await page.goto("/listings");
    await page.getByText("Garage Suite A").locator("visible=true").first().click();
    await expect(page.getByRole("heading", { name: "Garage Suite A" })).toBeVisible();

    await page.getByTestId("external-id-edit-ext-1").click();
    await expect(page.getByTestId("external-id-form-external-id")).toHaveValue("FF-12345");

    await page.getByTestId("external-id-edit-ext-2").click();
    await expect(page.getByTestId("external-id-form-source")).toHaveValue("Airbnb");
    await expect(page.getByTestId("external-id-form-external-id")).toHaveValue("AB-999");
    await expect(page.getByTestId("external-id-form-external-url")).toHaveValue("https://airbnb.com/rooms/999");

    await page.getByTestId("external-id-form-submit").click();
    await expect(page.getByTestId("external-id-form")).toHaveCount(0);

    expect(patches).toHaveLength(1);
    expect(new URL(patches[0].url()).pathname).toBe(`/api/listings/${LISTING_ID}/external-ids/ext-2`);
    expect(patches[0].postDataJSON()).toEqual({
      external_id: "AB-999",
      external_url: "https://airbnb.com/rooms/999",
    });
  });
});
