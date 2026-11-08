import { test, expect } from "./fixtures/auth";
import { createProperty, createTransaction, deleteProperty, deleteTransaction } from "./fixtures/seed-data";
import { getYear } from "date-fns";

const RUN_ID = Date.now();
const CURRENT_YEAR = getYear(new Date());
const TEST_YEAR = CURRENT_YEAR - 1;

test.describe("PWA setup", () => {
  test("PWA icons are served", async ({ authedPage: page }) => {
    const response = await page.goto("/pwa-192x192.png");
    expect(response?.status()).toBe(200);
  });

  test("favicon SVG is served", async ({ authedPage: page }) => {
    const response = await page.goto("/favicon.svg");
    expect(response?.status()).toBe(200);
  });
});

test.describe("Document checklist", () => {
  test("navigate to an existing tax return detail and verify checklist UI", async ({ authedPage: page, api }) => {
    // Fetch existing tax returns — the user should have at least one
    const existingRes = await api.get("/tax-returns");
    if (!existingRes.ok()) {
      test.skip(true, "Tax returns API not available");
      return;
    }
    const returns = (await existingRes.json()) as Array<{
      id: string;
      tax_year: number;
    }>;
    if (returns.length === 0) {
      test.skip(true, "No tax returns exist to verify checklist UI");
      return;
    }

    const targetReturn = returns[0];

    // Navigate to tax returns list and verify the return appears
    await page.goto("/tax-returns");
    await expect(page.getByRole("heading", { name: "Tax Returns" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(String(targetReturn.tax_year)).first()).toBeVisible({ timeout: 10000 });

    // Navigate to the tax return detail page
    await page.goto(`/tax-returns/${targetReturn.id}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify the detail page loads with tax return information
    await expect(page.getByText(String(targetReturn.tax_year)).first()).toBeVisible({ timeout: 10000 });

    // Verify checklist-related UI elements are present (document checklist tab or section)
    await expect(
      page.getByText(/checklist|documents|source|forms/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Tax report", () => {
  test("an approved tax-relevant expense shows under its property", async ({ authedPage: page, api }) => {
    const propertyName = `E2E Tax Report ${RUN_ID}`;
    const property = await createProperty(api, { name: propertyName });
    let txnId: string | null = null;
    try {
      const txn = await createTransaction(api, {
        vendor: `E2E Tax Report Vendor ${RUN_ID}`,
        amount: "250.00",
        transaction_type: "expense",
        category: "maintenance",
        transaction_date: `${TEST_YEAR}-06-15`,
        property_id: property.id,
        tax_relevant: true,
      });
      txnId = txn.id;
      // The report counts approved transactions only; manual ones start pending.
      const approveRes = await api.post("/transactions/bulk-approve", { data: { ids: [txn.id] } });
      expect(approveRes.ok()).toBe(true);
      expect(await approveRes.json()).toEqual({ approved: 1, skipped: 0 });

      await page.goto("/tax");
      await expect(page.getByRole("heading", { name: "Tax Report", level: 1 })).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole("combobox").first()).toHaveValue(String(TEST_YEAR));

      const row = page.getByRole("row").filter({ hasText: propertyName });
      // Property, Revenue, Expenses, Net Income
      await expect(row.getByRole("cell").nth(2)).toHaveText("$250.00", { timeout: 10000 });
    } finally {
      if (txnId) await deleteTransaction(api, txnId);
      await deleteProperty(api, property.id);
    }
  });
});

test.describe("Reconciliation workflow", () => {
  test("navigate through all three reconciliation steps and verify each renders content", async ({ authedPage: page }) => {
    // Navigate to reconciliation page
    await page.goto("/reconciliation");
    await expect(page.getByRole("heading", { name: /reconciliation/i })).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/upload 1099|review sources|discrepancies/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Step 1 — Upload 1099: form should be visible with source type, issuer, and amount fields
    await expect(page.getByRole("region", { name: "Upload 1099" })).toBeVisible({ timeout: 5000 });
    const sourceTypeSelect = page.locator("select").nth(1);
    await expect(sourceTypeSelect).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("e.g. Airbnb")).toBeVisible();
    await expect(page.locator("input[type='number']")).toBeVisible();
    await expect(page.getByRole("button", { name: /add 1099 source/i })).toBeVisible();

    // Step 2 — Review Sources: navigate and verify table or empty state renders
    await page.getByRole("button", { name: /review sources/i }).click();
    await expect(
      page.locator("table").or(page.getByText(/no reconciliation sources/i)),
    ).toBeVisible({ timeout: 10000 });

    // Step 3 — Discrepancies: click the step tab (not the "Review Discrepancies" action button)
    await page.getByRole("navigation", { name: "Reconciliation steps" }).getByRole("button", { name: "Discrepancies" }).click();
    await expect(
      page.getByText(/discrepanc|everything matches|no discrepancies/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
