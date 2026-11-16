/**
 * No-backend E2E for the mortgage dialogs' checks before saving.
 *
 * The server refuses a rate outside 0-25 and a balance without its statement
 * date, but the dialogs used to post anyway and show one generic failure toast.
 * Now the same checks the phone runs stop the save and name the field.
 *
 * Verifies:
 *   - An out-of-range rate shows its message under the field and sends nothing.
 *   - A balance with no statement date is named on the date field.
 *   - Fixing the figure lets the same dialog save, with one request.
 *   - Adding a loan without a rate type says so on that field.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";

const PROPERTY_ID = "00000000-0000-0000-0000-0000000000e1";
const MORTGAGE_ID = "00000000-0000-0000-0000-0000000000f1";

const PROPERTIES = [
  {
    id: PROPERTY_ID,
    name: "E2E Peerless",
    address: "1 Peerless St",
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
  },
];

const MORTGAGE = {
  id: MORTGAGE_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  organization_id: ORG_ID,
  property_id: PROPERTY_ID,
  property_name: "E2E Peerless",
  source_document_id: null,
  lender: "E2E Credit Union",
  account_number: null,
  current_balance_cents: 33613735,
  statement_date: "2026-08-01",
  original_principal_cents: null,
  interest_rate: "7.125",
  rate_type: "fixed",
  fixed_until: null,
  maturity_date: null,
  term_months: null,
  monthly_principal_cents: null,
  monthly_interest_cents: null,
  monthly_escrow_cents: null,
  notes: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const MORTGAGE_LIST = { items: [MORTGAGE], total: 1, has_more: false };

/** Writes the page sent, so a test can assert that a blocked save sent none. */
async function stubMortgageApi(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route("**/api/mortgages?*", (route) => route.fulfill(json(MORTGAGE_LIST)));
  await page.route("**/api/mortgages", async (route) => {
    if (route.request().method() === "GET") return route.fulfill(json(MORTGAGE_LIST));
    writes.push(route.request().method());
    return route.fulfill(json(MORTGAGE));
  });
  await page.route(`**/api/mortgages/${MORTGAGE_ID}`, async (route) => {
    writes.push(route.request().method());
    return route.fulfill(json(MORTGAGE));
  });
  return writes;
}

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, pending_count: 0 } satisfies AttributionReviewQueueResponse)),
  );
  await page.route("**/api/properties", (route) => route.fulfill(json(PROPERTIES)));
});

test.describe("Edit mortgage — checks before saving", () => {
  test("an out-of-range rate is named on the field, sent nowhere, then saves once fixed", async ({ page }) => {
    const writes = await stubMortgageApi(page);
    await page.goto("/mortgages");
    await page.getByTestId(`mortgage-item-${MORTGAGE_ID}`).click({ timeout: 15000 });

    await page.getByTestId("mortgage-interest-rate-input").fill("30");
    await page.getByTestId("mortgage-update-button").click();

    const problem = page.getByTestId("mortgage-interestRate-problem");
    await expect(problem).toBeVisible();
    await expect(problem).toContainText("above 0 and below 25");
    await expect(page.getByTestId("edit-mortgage-dialog")).toBeVisible();
    expect(writes, "an invalid form must not reach the server").toEqual([]);

    await page.getByTestId("mortgage-interest-rate-input").fill("6.5");
    await page.getByTestId("mortgage-update-button").click();

    await expect(page.getByTestId("edit-mortgage-dialog")).toBeHidden();
    expect(writes).toHaveLength(1);
  });

  test("a rate finer than the three decimals the server keeps is named on the field, not rounded", async ({ page }) => {
    const writes = await stubMortgageApi(page);
    await page.goto("/mortgages");
    await page.getByTestId(`mortgage-item-${MORTGAGE_ID}`).click({ timeout: 15000 });

    await page.getByTestId("mortgage-interest-rate-input").fill("7.1255");
    await page.getByTestId("mortgage-update-button").click();

    await expect(page.getByTestId("mortgage-interestRate-problem")).toContainText("at most three decimal places, like 7.125");
    expect(writes, "a rate the server would round must not reach it").toEqual([]);
  });

  test("a balance with no statement date is named on the date field", async ({ page }) => {
    const writes = await stubMortgageApi(page);
    await page.goto("/mortgages");
    await page.getByTestId(`mortgage-item-${MORTGAGE_ID}`).click({ timeout: 15000 });

    await page.getByTestId("mortgage-statement-date-input").fill("");
    await page.getByTestId("mortgage-update-button").click();

    await expect(page.getByTestId("mortgage-statementDate-problem")).toContainText("statement date");
    expect(writes).toEqual([]);
  });
});

test.describe("Add mortgage — checks before saving", () => {
  test("a missing rate type is named on that field", async ({ page }) => {
    const writes = await stubMortgageApi(page);
    await page.goto("/mortgages");
    await page.getByTestId("add-mortgage-button").click({ timeout: 15000 });

    await page.getByTestId("mortgage-property-select").selectOption(PROPERTY_ID);
    await page.getByTestId("mortgage-save-button").click();

    await expect(page.getByTestId("mortgage-rateType-problem")).toContainText("fixed or adjustable");
    expect(writes).toEqual([]);
  });
});
