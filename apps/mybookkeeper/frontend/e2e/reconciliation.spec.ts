import { test, expect } from "./fixtures/auth";
import { getYear } from "date-fns";
import { createTransaction, deleteTransaction } from "./fixtures/seed-data";

const RUN_ID = Date.now();
const CURRENT_YEAR = getYear(new Date());
const TEST_YEAR = CURRENT_YEAR - 1;

test.describe("Reconciliation — add and delete 1099 source", () => {
  let createdSourceId: string | null = null;

  test.afterAll(async ({ api }) => {
    if (createdSourceId) {
      await api.delete(`/reconciliation/sources/${createdSourceId}`).catch(() => {/* non-critical */});
    }
  });

  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/reconciliation");
    await expect(page.getByRole("heading", { name: /reconciliation/i })).toBeVisible();
    // Wait past any skeleton state
    await expect(page.getByText(/upload 1099|review sources|discrepancies/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("add a 1099 source — fills form, submits, and verifies it appears in sources", async ({ authedPage: page, api }) => {
    // Step 1 (Upload 1099) should be visible by default
    await expect(page.getByText("Upload 1099")).toBeVisible({ timeout: 5000 });

    // Source type select is the SECOND select on the page (first is the year selector)
    // Default is already 1099_k — just confirm the form is in step 1
    const sourceTypeSelect = page.locator("select").nth(1);
    await expect(sourceTypeSelect).toBeVisible({ timeout: 5000 });
    // 1099_k is the default; selecting it again is fine
    await sourceTypeSelect.selectOption("1099_k");

    // Fill issuer
    await page.getByPlaceholder("e.g. Airbnb").fill(`E2E Issuer ${RUN_ID}`);

    // Fill reported amount (only number input with placeholder 0.00 in the form)
    await page.locator("input[type='number']").fill("5000.00");

    // Submit
    await page.getByRole("button", { name: /add 1099 source/i }).click();

    // Success toast (use .first() to avoid strict mode violation with sr-only aria-live span)
    await expect(page.getByText(/1099 source added/i).first()).toBeVisible({ timeout: 10000 });

    // Should advance to step 2 (Review Sources) automatically — the table or empty state card appears
    await expect(
      page.locator("table").or(page.getByText(/no reconciliation sources/i))
    ).toBeVisible({ timeout: 10000 });

    // The row should appear in the sources table
    await expect(page.getByText(`E2E Issuer ${RUN_ID}`)).toBeVisible({ timeout: 10000 });

    // Capture ID for cleanup
    const res = await api.get(`/reconciliation/sources?tax_year=${TEST_YEAR}`);
    if (res.ok()) {
      const sources = await res.json();
      const src = sources.find((s: { issuer: string; id: string }) =>
        s.issuer === `E2E Issuer ${RUN_ID}`
      );
      if (src) createdSourceId = src.id;
    }
  });

  test("add source without an amount is blocked", async ({ authedPage: page }) => {
    // Leave reported amount blank
    await page.getByPlaceholder(/airbnb/i).fill("Some Issuer");
    // Amount field is required — submit should not succeed
    await page.getByRole("button", { name: /add 1099 source/i }).click();

    // No success toast should appear
    await expect(page.getByText(/1099 source added/i)).not.toBeVisible({ timeout: 2000 });
  });

  test("year selector changes the tax year context", async ({ authedPage: page }) => {
    const yearSelect = page.locator("select").first();
    const initial = await yearSelect.inputValue();

    const alt = String(CURRENT_YEAR - 2);
    await yearSelect.selectOption(alt);
    await expect(yearSelect).toHaveValue(alt);
    expect(alt).not.toBe(initial);
  });

  test("navigating to Review Sources step shows table or empty state", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /review sources/i }).click();
    await expect(
      page.locator("table").or(page.getByText(/no reconciliation sources/i))
    ).toBeVisible({ timeout: 10000 });
  });

  test("navigating to Discrepancies step shows results or empty state", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /discrepancies/i }).click();
    await expect(
      page.getByText(/discrepanc|everything matches|no discrepancies/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Reconciliation — compare with my records", () => {
  test("a 1099 goes from not compared to matched against real income", async ({ authedPage: page, api }) => {
    const issuer = `E2E Compare ${RUN_ID}`;
    const transaction = await createTransaction(api, {
      vendor: issuer,
      amount: "1234.00",
      transaction_type: "income",
      category: "rental_revenue",
      tax_relevant: true,
      transaction_date: `${TEST_YEAR}-06-15`,
    });

    try {
      // New transactions start pending, and a comparison only counts approved income.
      const approved = await api.patch(`/transactions/${transaction.id}`, { data: { status: "approved" } });
      expect(approved.ok()).toBe(true);

      const added = await api.post("/reconciliation/upload-1099", {
        data: { source_type: "1099_k", tax_year: TEST_YEAR, issuer, reported_amount: "1234.00" },
      });
      expect(added.ok()).toBe(true);

      await page.goto("/reconciliation");
      await page.getByRole("button", { name: /review sources/i }).click();

      const row = page.getByRole("row", { name: new RegExp(issuer) });
      await expect(row).toContainText("Unmatched", { timeout: 10000 });
      const reservationTotal = row.getByRole("cell").nth(5);
      const discrepancy = row.getByRole("cell").nth(6);
      await expect(reservationTotal).toHaveText("—");
      await expect(discrepancy).toHaveText("—");

      await page.getByRole("button", { name: "Compare with my records" }).click();

      await expect(page.getByText(new RegExp(`^${TEST_YEAR}: 1 matched, 0 differ\\.`)).first()).toBeVisible({ timeout: 10000 });
      await expect(row).toContainText("Matched", { timeout: 10000 });
      await expect(reservationTotal).toHaveText("$1,234.00");
      await expect(discrepancy).toHaveText("$0.00");

      const sources = await (await api.get(`/reconciliation/sources?tax_year=${TEST_YEAR}`)).json();
      const saved = sources.find((source: { issuer: string }) => source.issuer === issuer);
      expect(saved.status).toBe("matched");
    } finally {
      await deleteTransaction(api, transaction.id);
    }
  });
});
