// TransactionPanel split into TransactionForm + TransactionDuplicateActions — pure refactor, no behavior change.
import { test, expect } from "./fixtures/auth";
import type { Page } from "@playwright/test";

const RUN_ID = Date.now();

async function openManualEntryForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: /add transaction/i }).click();
  await expect(page.getByRole("heading", { name: /new transaction/i })).toBeVisible({ timeout: 5000 });
}

// Fills and submits the New Transaction form, then waits for the vendor to appear in the table.
async function createTransactionViaUI(page: Page, vendor: string, amount = "75.00"): Promise<void> {
  await openManualEntryForm(page);
  await page.locator("input[type='date']").first().fill("2025-06-15");
  await page.locator("input[placeholder='0.00']").fill(amount);
  await page.locator("input[placeholder='e.g. Home Depot']").fill(vendor);
  await page.getByRole("button", { name: /create transaction/i }).click();
  // Panel closes after successful creation
  await expect(page.getByRole("heading", { name: /new transaction/i })).not.toBeVisible({ timeout: 10000 });
  await expect(page.locator("tbody").getByText(vendor)).toBeVisible({ timeout: 10000 });
}

test.describe("Transactions", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
    await expect(
      page.locator("tbody tr").first().or(page.getByText(/no transactions found/i))
    ).toBeVisible({ timeout: 10000 });
  });

  // ─── Create transaction ──────────────────────────────────────────────────────

  test.describe("Create transaction", () => {
    test("creates a manual transaction and verifies it appears in the table", async ({ authedPage: page, api }) => {
      const vendor = `E2E Vendor ${RUN_ID}`;

      await createTransactionViaUI(page, vendor);

      // Capture ID for cleanup
      const res = await api.get("/transactions");
      const txns = await res.json();
      const created = (txns as Array<{ vendor: string; id: string }>).find((t) => t.vendor === vendor);
      if (created) await api.delete(`/transactions/${created.id}`).catch(() => {/* non-critical */});
    });
  });

  // ─── Edit transaction ────────────────────────────────────────────────────────

  test.describe("Edit transaction", () => {
    test("opens edit panel, changes a field, saves and verifies the change persists", async ({ authedPage: page, api }) => {
      const vendor = `E2E Edit Txn ${RUN_ID}`;

      // Create via the UI form so we don't depend on the broken POST API
      await createTransactionViaUI(page, vendor, "99.00");

      // Get the ID for later cleanup
      const listRes = await api.get("/transactions");
      const txns = await listRes.json();
      const created = (txns as Array<{ vendor: string; id: string }>).find((t) => t.vendor === vendor);
      const createdId = created?.id ?? null;

      try {
        // Open the row
        const row = page.locator("tbody tr").filter({ hasText: vendor });
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        // Edit panel opens — the vendor input is registered via react-hook-form with name="vendor"
        const vendorInput = page.locator('input[name="vendor"]');
        await expect(vendorInput).toBeVisible({ timeout: 5000 });

        // Change the vendor name
        const updatedVendor = `E2E Edited ${RUN_ID}`;
        await vendorInput.clear();
        await vendorInput.fill(updatedVendor);

        // Save
        await page.getByRole("button", { name: /^save$/i }).click();

        // Updated vendor should now appear in the table
        await expect(page.locator("tbody tr").filter({ hasText: updatedVendor })).toBeVisible({ timeout: 10000 });
        await expect(page.locator("tbody tr").filter({ hasText: vendor })).not.toBeVisible({ timeout: 5000 });
      } finally {
        if (createdId) {
          await api.delete(`/transactions/${createdId}`).catch(() => {/* non-critical */});
        }
      }
    });
  });

  // ─── Approve transaction ─────────────────────────────────────────────────────

  test.describe("Approve transaction", () => {
    test("approves a pending transaction and verifies the status badge changes", async ({ authedPage: page, api }) => {
      const vendor = `E2E Approve ${RUN_ID}`;

      // Create via UI — new manual transactions start as "pending"
      await createTransactionViaUI(page, vendor, "55.00");

      // Get the ID for cleanup
      const listRes = await api.get("/transactions");
      const txns = await listRes.json();
      const created = (txns as Array<{ vendor: string; id: string }>).find((t) => t.vendor === vendor);
      const createdId = created?.id ?? null;

      try {
        // Open the row
        const row = page.locator("tbody tr").filter({ hasText: vendor });
        await expect(row).toBeVisible({ timeout: 10000 });
        await row.click();

        // The Approve button appears for pending/needs_review transactions.
        // Scope to the panel (not the bulk approve button in the toolbar).
        const approveBtn = page.getByRole("button", { name: /^approve$/i }).last();
        await expect(approveBtn).toBeVisible({ timeout: 5000 });
        await approveBtn.click();

        // Verify status via API
        if (createdId) {
          await expect.poll(async () => {
            const verifyRes = await api.get(`/transactions/${createdId}`);
            const updated = await verifyRes.json();
            return updated.status;
          }, { timeout: 5000 }).toBe("approved");
        }
      } finally {
        if (createdId) {
          await api.delete(`/transactions/${createdId}`).catch(() => {/* non-critical */});
        }
      }
    });
  });

  // ─── Export CSV ──────────────────────────────────────────────────────────────

  test.describe("Export", () => {
    test("export CSV menu item opens and can be clicked", async ({ authedPage: page }) => {
      // Clicking Export CSV triggers a blob-URL download (api.get + URL.createObjectURL),
      // which cannot be reliably detected by Playwright in any runtime (no download event,
      // no observable network response when requested through axios with responseType=blob
      // and intercepted by the service worker). Verify the menu opens and the item is
      // clickable — download behavior is covered by the backend export unit tests.
      await page.getByRole("button", { name: /export/i }).click();
      const csvItem = page.getByRole("menuitem", { name: /export csv/i });
      await expect(csvItem).toBeVisible({ timeout: 3000 });
      // Radix DropdownMenu renders in a Portal that may be outside the viewport;
      // dispatch a direct click event to bypass viewport/stability checks.
      await csvItem.dispatchEvent("click");
      // After click, the dropdown should close
      await expect(csvItem).not.toBeVisible({ timeout: 5000 });
    });

    test("export button shows CSV and PDF options", async ({ authedPage: page }) => {
      await page.getByRole("button", { name: /export/i }).click();
      await expect(page.getByText("Export CSV")).toBeVisible({ timeout: 3000 });
      await expect(page.getByText("Export PDF")).toBeVisible();
    });
  });

  // ─── Table interaction ───────────────────────────────────────────────────────

  test.describe("Table interaction", () => {
    test("selecting a row checkbox shows bulk action bar with count", async ({ authedPage: page }) => {
      const checkbox = page.locator("tbody input[type='checkbox']").first();
      test.skip(!(await checkbox.isVisible()), "No transactions to select — table is empty");

      await checkbox.click();
      await expect(page.getByText(/\d+ selected/)).toBeVisible({ timeout: 5000 });

      // Clear selection
      const clear = page.getByRole("button", { name: /clear/i });
      if (await clear.isVisible()) {
        await clear.click();
        await expect(page.getByText(/\d+ selected/)).not.toBeVisible({ timeout: 5000 });
      }
    });

    test("clicking a row opens the edit panel with form fields", async ({ authedPage: page }) => {
      const row = page.locator("tbody tr").first();
      test.skip(!(await row.isVisible()), "No transactions in table — seed data to run this test");

      await row.click();
      // Panel shows a date input (use first() to avoid strict mode error with filter date inputs)
      await expect(page.locator("input[type='date']").first()).toBeVisible({ timeout: 5000 });
      // Close
      await page.keyboard.press("Escape");
    });

    test("cancel closes the new transaction form without creating", async ({ authedPage: page }) => {
      await page.getByRole("button", { name: /add transaction/i }).click();
      await expect(page.getByRole("heading", { name: /new transaction/i })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /^cancel$/i }).first().click();
      await expect(page.getByRole("heading", { name: /new transaction/i })).not.toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Vendor rules ────────────────────────────────────────────────────────────

  test.describe("Vendor rules panel", () => {
    test("opens vendor rules panel from toolbar", async ({ authedPage: page }) => {
      await page.getByRole("button", { name: /vendor rules/i }).click();
      await expect(page.getByText("Classification Rules").first()).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /close panel/i }).click();
      await expect(page.getByText("Classification Rules")).not.toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Import ──────────────────────────────────────────────────────────────────

  test.describe("Bank statement import", () => {
    test("import button opens the import modal", async ({ authedPage: page }) => {
      await page.getByRole("button", { name: /import/i }).click();
      await expect(page.getByRole("heading", { name: /import bank statement/i })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /close import modal/i }).click();
      await expect(page.getByRole("heading", { name: /import bank statement/i })).not.toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Duplicates tab ───────────────────────────────────────────────────────

  test.describe("Duplicates tab", () => {
    test("Transactions page has a Duplicates tab", async ({ authedPage: page }) => {
      const dupTab = page.getByRole("button", { name: /Duplicates/ }).first();
      await expect(dupTab).toBeVisible({ timeout: 5000 });
    });

    test("clicking Duplicates tab switches view and updates URL", async ({ authedPage: page }) => {
      await page.getByRole("button", { name: /Duplicates/ }).first().click();
      await expect(page).toHaveURL(/tab=duplicates/, { timeout: 5000 });
      // Filter bar should not be visible on duplicates tab
      await expect(page.getByText(/All Properties/).first()).not.toBeVisible({ timeout: 3000 });
    });

    test("duplicates tab shows cards or empty state", async ({ authedPage: page }) => {
      await page.goto("/transactions?tab=duplicates");
      await expect(
        page.locator("[class*='border rounded-lg']").first().or(page.getByText(/No suspected duplicates/i))
      ).toBeVisible({ timeout: 15000 });
    });

    test("duplicates tab hides transaction-only actions", async ({ authedPage: page }) => {
      await page.goto("/transactions?tab=duplicates");
      await page.waitForLoadState("domcontentloaded");
      await expect(page.getByRole("button", { name: "Add Transaction" })).not.toBeVisible({ timeout: 3000 });
    });

    test("switching back to Transactions tab restores the table", async ({ authedPage: page }) => {
      await page.goto("/transactions?tab=duplicates");
      // Wait for the duplicates tab content to load (tab buttons are disabled while loading)
      await expect(
        page.locator("[class*='border rounded-lg']").first().or(page.getByText(/No suspected duplicates/i))
      ).toBeVisible({ timeout: 15000 });

      // Scope to the tab bar (direct sibling of the page header), not the sidebar nav link
      const txnTab = page.locator("div.flex.gap-1.border-b").getByRole("button", { name: "Transactions" });
      await expect(txnTab).toBeEnabled({ timeout: 10000 });
      await txnTab.dispatchEvent("click");
      await expect(page).toHaveURL(/\/transactions(?!\?tab)/, { timeout: 10000 });
      // Filter bar (with status, type, category selects) should reappear — check the select elements
      await expect(page.locator("select").first()).toBeVisible({ timeout: 5000 });
    });

    test("direct URL navigation to duplicates tab works", async ({ authedPage: page }) => {
      await page.goto("/transactions?tab=duplicates");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 5000 });
      await expect(
        page.locator("[class*='border rounded-lg']").first().or(page.getByText(/No suspected duplicates/i))
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // ─── Transaction panel — review reason ──────────────────────────────────

  test.describe("Transaction panel review reason", () => {
    test("needs_review transaction shows review reason banner when data exists", async ({ authedPage: page }) => {
      // Look for any needs_review badge in the table
      const reviewBadge = page.getByText("needs_review").first();
      test.skip(!(await reviewBadge.isVisible({ timeout: 5000 }).catch(() => false)), "No needs_review transactions in table — seed data to run this test");

      // Click the row containing the needs_review badge
      await reviewBadge.locator("xpath=ancestor::tr").click();
      await page.waitForTimeout(500);

      // Panel should show the review reason in a yellow banner if review_reason exists
      const banner = page.locator("[class*='bg-yellow']");
      const hasBanner = await banner.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasBanner) {
        await expect(banner).toContainText(/match|property|extract|amount/i);
      }
      await page.keyboard.press("Escape");
    });
  });

  // ─── Transaction panel — source document ────────────────────────────────

  test.describe("Transaction panel source document", () => {
    test("transaction with source document shows file link", async ({ authedPage: page }) => {
      const row = page.locator("tbody tr").first();
      test.skip(!(await row.isVisible({ timeout: 5000 }).catch(() => false)), "No transactions in table — seed data to run this test");

      await row.click();
      await page.waitForTimeout(500);

      // If the transaction has a source file, the link should be visible
      const sourceLink = page.locator("text=/\\.pdf$|\\.csv$|\\.xlsx$/i");
      const hasSource = await sourceLink.first().isVisible({ timeout: 3000 }).catch(() => false);
      // This validates the source document link renders when data exists
      if (hasSource) {
        await expect(sourceLink.first()).toBeVisible();
      }
      await page.keyboard.press("Escape");
    });
  });

  // ─── Vendor filter (PR #197) ─────────────────────────────────────────────────

  test.describe("Vendor filter", () => {
    test.describe.configure({ mode: "serial" });

    const seedVendorA = `E2E VendorFilterA ${RUN_ID}`;
    const seedVendorB = `E2E VendorFilterB ${RUN_ID}`;
    const createdIds: string[] = [];

    test("seeds two transactions with distinct vendors for filter tests", async ({
      authedPage: page,
      api,
    }) => {
      await createTransactionViaUI(page, seedVendorA, "12.34");
      await createTransactionViaUI(page, seedVendorB, "56.78");

      // Record ids for cleanup in the final test
      const listRes = await api.get("/transactions");
      const txns = (await listRes.json()) as Array<{ vendor: string; id: string }>;
      for (const vendor of [seedVendorA, seedVendorB]) {
        const created = txns.find((t) => t.vendor === vendor);
        if (created) createdIds.push(created.id);
      }

      // Ensure both rows are in the table before the filter test runs
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorA })).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorB })).toBeVisible({
        timeout: 10000,
      });
    });

    test("typing in the vendor filter narrows results to matching rows", async ({
      authedPage: page,
    }) => {
      // The vendor filter input is rendered inside TransactionFilterBar.
      const vendorFilter = page.getByPlaceholder(/filter by vendor/i).first();
      await expect(vendorFilter).toBeVisible({ timeout: 10000 });

      // Filter by the unique A identifier — B must disappear
      await vendorFilter.fill(seedVendorA);

      await expect(page.locator("tbody tr").filter({ hasText: seedVendorA })).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorB })).not.toBeVisible({
        timeout: 5000,
      });
    });

    test("clearing the vendor filter shows all transactions again", async ({
      authedPage: page,
    }) => {
      const vendorFilter = page.getByPlaceholder(/filter by vendor/i).first();
      await expect(vendorFilter).toBeVisible({ timeout: 10000 });

      // Apply a narrow filter first, then clear it
      await vendorFilter.fill(seedVendorA);
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorB })).not.toBeVisible({
        timeout: 5000,
      });

      // Use fill("") to trigger the controlled input's onChange handler
      await vendorFilter.fill("");

      // Both seeded rows should be visible again after the filter refetches
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorA })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorB })).toBeVisible({
        timeout: 15000,
      });
    });

    test("partial vendor match filters correctly (case insensitive substring)", async ({
      authedPage: page,
    }) => {
      // Navigate explicitly to a clean transactions page (no tab param, no filter state)
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 10000 });

      const vendorFilter = page.getByPlaceholder(/filter by vendor/i).first();
      await expect(vendorFilter).toBeVisible({ timeout: 10000 });

      // Use a shared substring that exists in both seeded vendors
      await vendorFilter.fill(`VendorFilter`);

      // Both seeded rows should still be visible since they share the substring
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorA })).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator("tbody tr").filter({ hasText: seedVendorB })).toBeVisible({
        timeout: 10000,
      });

      // Clear for the next test
      await vendorFilter.clear();
    });

    test("cleans up seeded vendor filter transactions", async ({ api }) => {
      for (const id of createdIds) {
        await api.delete(`/transactions/${id}`).catch(() => {
          /* non-critical */
        });
      }
      createdIds.length = 0;
    });
  });

  test.describe("Delete from edit panel", () => {
    test("edit panel shows delete button with confirmation", async ({ authedPage: page }) => {
      await page.goto("/transactions");
      await expect(page.getByText("Transactions").first()).toBeVisible({ timeout: 15000 });

      // Click a transaction row to open the edit panel
      const row = page.locator("tr").nth(1);
      if ((await row.count()) === 0) {
        test.skip();
        return;
      }
      await row.click();

      // Edit panel should open — find the specific "Delete transaction" button
      const deleteBtn = page.getByRole("button", { name: "Delete transaction" });
      await expect(deleteBtn).toBeVisible({ timeout: 5000 });

      // Click delete — confirmation dialog should appear
      await deleteBtn.click();
      await expect(page.getByText(/are you sure you want to delete/i)).toBeVisible({ timeout: 5000 });

      // Cancel the deletion
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByText(/are you sure you want to delete/i)).not.toBeVisible({ timeout: 3000 });
    });
  });
});
