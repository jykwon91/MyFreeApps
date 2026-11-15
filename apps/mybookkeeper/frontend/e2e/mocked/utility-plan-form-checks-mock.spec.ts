/**
 * No-backend E2E for the add-plan dialog's checks before saving.
 *
 * The server refuses a rate above 999.9999 cents, a term that ends before the
 * service starts, and an internet speed above 100,000 Mbps, but the dialog used
 * to post anyway and show one generic failure toast. Now the same checks the
 * phone runs stop the save and name the field.
 *
 * Verifies:
 *   - A rate in dollars-not-cents is named on the field and sends nothing.
 *   - A term ending before the service starts is named on the end date.
 *   - Fixing the figures lets the same dialog save, with one request.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

const PROPERTY_ID = "00000000-0000-0000-0000-0000000000c3";

/** Writes the page sent, so a test can assert that a blocked save sent none. */
async function stubUtilityApi(page: Page): Promise<string[]> {
  const writes: string[] = [];
  const empty = { items: [], total: 0, has_more: false };
  await page.route("**/api/properties", (route) => route.fulfill(json([{ id: PROPERTY_ID, name: "E2E Peerless" }])));
  await page.route("**/api/utility-plans/renewal-alerts*", (route) =>
    route.fulfill(json({ expiring_count: 0, expired_count: 0, plans: [] })),
  );
  await page.route("**/api/utility-plans/rate-comparison*", (route) => route.fulfill(json({ rows: [], benchmarks: [] })));
  await page.route("**/api/market-rate-benchmarks*", (route) => route.fulfill(json([])));
  await page.route("**/api/utility-plans?*", (route) => route.fulfill(json(empty)));
  await page.route("**/api/utility-plans", async (route) => {
    if (route.request().method() === "GET") return route.fulfill(json(empty));
    writes.push(route.request().method());
    return route.fulfill(json({ id: "00000000-0000-0000-0000-0000000000f3" }));
  });
  await page.route("**/api/documents*", (route) => route.fulfill(json([])));
  return writes;
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
});

async function openAddDialog(page: Page): Promise<void> {
  await page.goto("/utility-plans");
  await page.getByTestId("add-utility-plan-button").click({ timeout: 15000 });
  await expect(page.getByTestId("add-utility-plan-dialog")).toBeVisible();
  await page.getByTestId("utility-plan-property-select").selectOption(PROPERTY_ID);
  await page.getByTestId("utility-plan-provider-input").fill("E2E Energy");
}

test.describe("Add utility plan — checks before saving", () => {
  test("a rate above the cents ceiling is named on the field, sent nowhere, then saves once fixed", async ({ page }) => {
    const writes = await stubUtilityApi(page);
    await openAddDialog(page);

    await page.getByTestId("utility-plan-energy-input").fill("1500");
    await page.getByTestId("utility-plan-save-button").click();

    const problem = page.getByTestId("utility-plan-energyCharge-problem");
    await expect(problem).toBeVisible();
    await expect(problem).toContainText("cents");
    await expect(page.getByTestId("utility-plan-energy-input")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("add-utility-plan-dialog")).toBeVisible();
    expect(writes, "an invalid form must not reach the server").toEqual([]);

    await page.getByTestId("utility-plan-energy-input").fill("11.5");
    await page.getByTestId("utility-plan-save-button").click();

    await expect(page.getByTestId("add-utility-plan-dialog")).toBeHidden();
    expect(writes).toHaveLength(1);
  });

  test("a term that ends before the service starts is named on the end date", async ({ page }) => {
    const writes = await stubUtilityApi(page);
    await openAddDialog(page);

    await page.getByTestId("utility-plan-start-date-input").fill("2026-02-01");
    await page.getByTestId("utility-plan-end-date-input").fill("2026-01-01");
    await page.getByTestId("utility-plan-save-button").click();

    await expect(page.getByTestId("utility-plan-termEndDate-problem")).toContainText("can't end before");
    expect(writes).toEqual([]);
  });
});
