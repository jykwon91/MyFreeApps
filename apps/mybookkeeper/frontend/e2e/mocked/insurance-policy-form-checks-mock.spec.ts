/**
 * No-backend E2E for the add-policy dialog's checks before saving.
 *
 * The server refuses a premium of zero, a wind and hail percentage of zero or
 * with more than two decimals, and a name over 255 characters, but the dialog
 * used to post anyway and show one generic failure toast. Now the same checks
 * the phone runs stop the save and name the field.
 *
 * Verifies:
 *   - A premium that rounds to zero cents is named on the field and sends nothing.
 *   - A wind and hail percentage with three decimals is named and sends nothing.
 *   - A premium with no billing period is named on the Billed field.
 *   - Fixing the figures lets the same dialog save, with one request.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";

const PROPERTY_ID = "00000000-0000-0000-0000-0000000000c2";

/** Writes the page sent, so a test can assert that a blocked save sent none. */
async function stubInsuranceApi(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route("**/api/properties", (route) => route.fulfill(json([{ id: PROPERTY_ID, name: "E2E Peerless" }])));
  await page.route("**/api/insurance-policies?*", (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  await page.route("**/api/insurance-policies", async (route) => {
    if (route.request().method() === "GET") return route.fulfill(json({ items: [], total: 0, has_more: false }));
    writes.push(route.request().method());
    return route.fulfill(json({ id: "00000000-0000-0000-0000-0000000000f2" }));
  });
  await page.route("**/api/insurance-benchmarks?*", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  return writes;
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, pending_count: 0 } satisfies AttributionReviewQueueResponse)),
  );
});

async function openAddDialog(page: Page): Promise<void> {
  await page.goto("/insurance-policies");
  await page.getByTestId("add-insurance-policy-button").click({ timeout: 15000 });
  await expect(page.getByTestId("add-insurance-policy-dialog")).toBeVisible();
  await page.getByTestId("insurance-policy-property-select").selectOption(PROPERTY_ID);
  await page.getByTestId("insurance-policy-name-input").fill("E2E policy");
}

test.describe("Add insurance policy — checks before saving", () => {
  test("a premium of zero is named on the field, sent nowhere, then saves once fixed", async ({ page }) => {
    const writes = await stubInsuranceApi(page);
    await openAddDialog(page);

    await page.getByTestId("insurance-premium-input").fill("0");
    await page.getByTestId("insurance-premium-frequency-select").selectOption("monthly");
    await page.getByTestId("insurance-policy-save-button").click();

    const problem = page.getByTestId("insurance-premiumDollars-problem");
    await expect(problem).toBeVisible();
    await expect(problem).toContainText("above 0");
    await expect(page.getByTestId("insurance-premium-input")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("add-insurance-policy-dialog")).toBeVisible();

    // A fraction of a cent is refused as it was typed, never rounded to a different premium.
    await page.getByTestId("insurance-premium-input").fill("0.001");
    await page.getByTestId("insurance-policy-save-button").click();
    await expect(problem).toContainText("plain amount");
    await expect(page.getByTestId("add-insurance-policy-dialog")).toBeVisible();
    expect(writes, "an invalid form must not reach the server").toEqual([]);

    await page.getByTestId("insurance-premium-input").fill("120.50");
    await page.getByTestId("insurance-policy-save-button").click();

    await expect(page.getByTestId("add-insurance-policy-dialog")).toBeHidden();
    expect(writes).toHaveLength(1);
  });

  test("a wind and hail percentage with three decimals is named on the field", async ({ page }) => {
    const writes = await stubInsuranceApi(page);
    await openAddDialog(page);

    await page.getByTestId("insurance-wind-hail-input").fill("2.555");
    await page.getByTestId("insurance-policy-save-button").click();

    await expect(page.getByTestId("insurance-windHailPct-problem")).toContainText("two decimal places");
    expect(writes).toEqual([]);
  });

  test("a premium with no billing period is named on the Billed field", async ({ page }) => {
    const writes = await stubInsuranceApi(page);
    await openAddDialog(page);

    await page.getByTestId("insurance-premium-input").fill("1200");
    await page.getByTestId("insurance-policy-save-button").click();

    await expect(page.getByTestId("insurance-premiumFrequency-problem")).toContainText("how often");
    expect(writes).toEqual([]);
  });
});
