/**
 * No-backend E2E for a rental's depreciation inputs on the property edit card.
 *
 * Form 4562 (and so Schedule E line 18) is computed from a rental's land value
 * and date placed in service, but no screen could set them. Now the edit card
 * asks for both on a rental, checks them before saving, and hides them for a
 * home that isn't rented.
 *
 * Verifies:
 *   - Land and date typed on a rental are sent in the PATCH, as the API reads them.
 *   - Land worth more than the purchase price blocks the save and sends nothing.
 *   - A primary residence doesn't show the inputs.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { DEPRECIATION_INPUT_MESSAGES } from "@mybookkeeper/api-client/constants/depreciationInputs";

const PROPERTY_ID = "00000000-0000-0000-0000-0000000000d1";

const RENTAL: Property = {
  id: PROPERTY_ID,
  name: "E2E Peerless",
  address: "1 Peerless St, Houston, TX 77021",
  classification: "investment",
  type: "long_term",
  is_active: true,
  purchase_price: "300000.00",
  land_value: null,
  date_placed_in_service: null,
  activity_periods: [],
  created_at: "2026-01-01T00:00:00Z",
};

/** The PATCH bodies sent, so a test can assert what was saved or that nothing was. */
async function stubProperties(page: Page, property: Property): Promise<Record<string, unknown>[]> {
  const patches: Record<string, unknown>[] = [];
  await page.route("**/api/properties", (route) => route.fulfill(json([property])));
  await page.route(`**/api/properties/${PROPERTY_ID}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push(body);
    return route.fulfill(json({ ...property, ...body }));
  });
  return patches;
}

async function openEditCard(page: Page) {
  await page.goto("/properties");
  await page.locator("li").filter({ hasText: RENTAL.name }).getByTitle("Edit").click({ timeout: 15000 });
  return page.locator("li").filter({ has: page.getByRole("button", { name: /save/i }) });
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
});

test.describe("Property edit — depreciation inputs", () => {
  test("a rental's land value and date placed in service are saved", async ({ page }) => {
    const patches = await stubProperties(page, RENTAL);
    const card = await openEditCard(page);

    await card.getByLabel(DEPRECIATION_INPUT_MESSAGES.landValue).fill("$25,000");
    await card.getByLabel(DEPRECIATION_INPUT_MESSAGES.placedInService).fill("2023-03-15");
    await card.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText("Property updated", { exact: true })).toBeVisible();
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ land_value: "25000.00", date_placed_in_service: "2023-03-15" });
  });

  test("land worth more than the purchase price is named and not sent", async ({ page }) => {
    const patches = await stubProperties(page, RENTAL);
    const card = await openEditCard(page);

    await card.getByLabel(DEPRECIATION_INPUT_MESSAGES.landValue).fill("350000");

    await expect(card.getByText(DEPRECIATION_INPUT_MESSAGES.landValueOverPrice)).toBeVisible();
    await expect(card.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(patches).toEqual([]);
  });

  test("a primary residence doesn't ask for them", async ({ page }) => {
    await stubProperties(page, { ...RENTAL, classification: "primary_residence", type: null });
    const card = await openEditCard(page);

    await expect(card.getByLabel("Purchase price")).toBeVisible();
    await expect(card.getByLabel(DEPRECIATION_INPUT_MESSAGES.landValue)).toHaveCount(0);
    await expect(card.getByLabel(DEPRECIATION_INPUT_MESSAGES.placedInService)).toHaveCount(0);
  });
});
