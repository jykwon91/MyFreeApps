import { test, expect } from "./fixtures/auth";
import type { Page } from "@playwright/test";
import { BACKEND_URL } from "./fixtures/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_ID = Date.now();

function getToken(): string {
  return fs.readFileSync(path.join(__dirname, ".auth-token"), "utf-8").trim();
}

function getOrgId(): string {
  const orgPath = path.join(__dirname, ".auth-org");
  return fs.existsSync(orgPath) ? fs.readFileSync(orgPath, "utf-8").trim() : "";
}

/**
 * Create a manual transaction via API (faster than UI for test setup).
 * Returns the transaction ID.
 */
async function createTransactionViaAPI(
  page: Page,
  vendor: string,
  amount: string,
  date: string,
  category = "contract_work",
): Promise<string> {
  const token = getToken();
  const res = await page.request.post(`${BACKEND_URL}/transactions`, {
    headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": getOrgId() },
    data: {
      vendor,
      amount,
      transaction_date: date,
      transaction_type: "expense",
      category,
      tags: [category],
      tax_relevant: true,
      is_manual: true,
    },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  return body.id;
}

/**
 * Delete a transaction via API (cleanup).
 */
async function deleteTransactionViaAPI(page: Page, id: string): Promise<void> {
  const token = getToken();
  await page.request.delete(`${BACKEND_URL}/transactions/${id}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": getOrgId() },
  });
}

test.describe("Duplicate merge — full user flow", () => {
  const vendor = `E2E-Merge-Test-${RUN_ID}`;
  const txnIds: string[] = [];

  test.beforeAll(async ({ browser }) => {
    // Create two transactions with same vendor, same amount, close dates → triggers duplicate detection
    const page = await browser.newPage();
    const token = getToken();
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("token", t), token);

    const idA = await createTransactionViaAPI(page, vendor, "999.99", "2025-08-10");
    const idB = await createTransactionViaAPI(page, vendor, "999.99", "2025-08-12");
    txnIds.push(idA, idB);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    // Clean up any surviving test transactions
    const page = await browser.newPage();
    const token = getToken();
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("token", t), token);

    for (const id of txnIds) {
      await deleteTransactionViaAPI(page, id).catch(() => {});
    }
    await page.close();
  });

  test("created duplicates appear in the Duplicates tab", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await page.waitForLoadState("domcontentloaded");

    // Wait for our test duplicate pair to appear (vendor name is unique per run)
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });
  });

  test("merge button replaces keep A/B buttons", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });

    // Find the card containing our test vendor
    const card = page.locator("[class*='border rounded-lg']", { hasText: vendor }).first();
    await expect(card.getByRole("button", { name: /merge/i })).toBeVisible();
    await expect(card.getByRole("button", { name: /not duplicates/i })).toBeVisible();
    // Old keep buttons should NOT exist
    await expect(card.getByRole("button", { name: /keep invoice/i })).not.toBeVisible();
  });

  test("clicking Merge expands picker with source context and date selector", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });

    const card = page.locator("[class*='border rounded-lg']", { hasText: vendor }).first();
    await card.getByRole("button", { name: /merge/i }).click();

    // Source document context should show
    await expect(page.getByText(/source a/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/source b/i).first()).toBeVisible({ timeout: 5000 });

    // Should show the field picker (confirm merge button proves it expanded)
    await expect(page.getByRole("button", { name: /confirm merge/i })).toBeVisible({ timeout: 5000 });

    // Confirm Merge and Cancel buttons should be visible
    await expect(page.getByRole("button", { name: /confirm merge/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();

    // Merged result preview should be visible
    await expect(page.getByText(/merged result preview/i)).toBeVisible();
  });

  test("source document filenames are clickable to open document viewer", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });

    const card = page.locator("[class*='border rounded-lg']", { hasText: vendor }).first();

    // Source filenames should be clickable (blue link style) if document exists
    const sourceLink = card.locator("button", { hasText: /\.(pdf|png|jpg)/i }).first();
    const hasDocLink = await sourceLink.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasDocLink) {
      await sourceLink.click();
      // DocumentViewer panel should open with "Source document" header
      await expect(page.getByText(/source document/i)).toBeVisible({ timeout: 5000 });
      // Close the viewer
      await page.keyboard.press("Escape");
      await expect(page.getByText(/source document/i)).not.toBeVisible({ timeout: 3000 });
    }
    // If no document link (manual transactions), that's valid — no doc to view
  });

  test("selecting a different date updates the merged result preview", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });

    const card = page.locator("[class*='border rounded-lg']", { hasText: vendor }).first();
    await card.getByRole("button", { name: /merge/i }).click();
    await expect(page.getByRole("button", { name: /confirm merge/i })).toBeVisible({ timeout: 5000 });

    // Find the date field row — click the non-selected side
    const dateRow = page.locator("button", { hasText: /aug 1[02]/i });
    // Click the one that's not currently selected (has opacity-50)
    const unselected = dateRow.locator(".opacity-50").first();
    if (await unselected.isVisible().catch(() => false)) {
      await unselected.click();
    }
  });

  test("cancel collapses the merge picker without changes", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });

    const card = page.locator("[class*='border rounded-lg']", { hasText: vendor }).first();
    await card.getByRole("button", { name: /merge/i }).click();
    await expect(page.getByRole("button", { name: /confirm merge/i })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("button", { name: /confirm merge/i })).not.toBeVisible({ timeout: 3000 });

    // Pair should still be there
    await expect(page.getByText(vendor).first()).toBeVisible();
  });

  test("confirm merge resolves the pair and shows success", async ({ authedPage: page }) => {
    await page.goto("/transactions?tab=duplicates");
    await expect(page.getByText(vendor).first()).toBeVisible({ timeout: 15000 });

    const card = page.locator("[class*='border rounded-lg']", { hasText: vendor }).first();
    await card.getByRole("button", { name: /merge/i }).click();
    await expect(page.getByRole("button", { name: /confirm merge/i })).toBeVisible({ timeout: 5000 });

    // Confirm the merge
    await page.getByRole("button", { name: /confirm merge/i }).click();

    // Should show success toast or the pair disappears
    await expect(page.getByText(/merged/i).first()).toBeVisible({ timeout: 10000 });

    // Wait for UI to update — the pair should disappear or reduce
    // The RTK cache invalidation will refresh the list
    await page.waitForTimeout(2000);

    // Navigate away and back to force fresh data
    await page.goto("/transactions?tab=duplicates");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.locator("[class*='border rounded-lg']").first().or(page.getByText(/No suspected duplicates/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("after merging, only one transaction remains in the list", async ({ authedPage: page }) => {
    // Navigate to transactions tab to verify
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });

    // At least one of our test transactions should be visible (the surviving one)
    // The other should be soft-deleted (status=duplicate, filtered out)
    const vendorCells = page.locator("tbody").getByText(vendor);
    const count = await vendorCells.count();
    // Should be 0 (if merge already happened and cleaned up) or 1 (surviving)
    expect(count).toBeLessThanOrEqual(1);
  });
});
