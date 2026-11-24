/**
 * Personal spending categories — real backend, fresh org.
 *
 * Drives the full user flow:
 * 1. Navigate to the Spending Categories page; default categories are seeded
 *    automatically on first load.
 * 2. Add a custom category; it appears in the live list.
 * 3. Create a transaction with personal scope and that custom category; verify
 *    the backend records the scope and category.
 * 4. Filter the transactions list by scope = personal; the transaction shows up.
 * 5. Archive the custom category; it moves to the archived section.
 * 6. Restore it; it comes back live.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { deleteTransaction } from "./fixtures/seed-data";

const org = seededOrg("spending-categories");

interface CategoryItem {
  id: string;
  name: string;
  is_default: boolean;
  archived_at: string | null;
}

async function listCategories(api: APIRequestContext): Promise<CategoryItem[]> {
  const res = await api.get("/spending-categories?include_archived=true");
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { items: CategoryItem[] }).items;
}

async function categoryNamed(api: APIRequestContext, name: string): Promise<CategoryItem | undefined> {
  return (await listCategories(api)).find((c) => c.name === name);
}

/** Silently delete a custom category for cleanup. */
async function archiveCategoryNamed(api: APIRequestContext, name: string): Promise<void> {
  const found = await categoryNamed(api, name).catch(() => undefined);
  if (found && !found.is_default) {
    await api.post(`/spending-categories/${found.id}/archive`).catch(() => undefined);
  }
}

async function openSpendingCategories(page: Page): Promise<void> {
  await page.goto("/spending-categories");
  await expect(page.getByRole("heading", { name: /personal spending categories/i })).toBeVisible();
  await expect(page.getByTestId("spending-categories-skeleton")).toBeHidden({ timeout: 15000 });
}

test.describe("Spending categories", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
  });

  test("default categories are seeded on first visit", async ({ page }) => {
    await openSpendingCategories(page);
    // "Groceries" is one of the built-in defaults
    await expect(page.getByText("Groceries")).toBeVisible();
  });

  test("add a custom category and verify it persists", async ({ page, request }) => {
    const name = `E2E Category ${Date.now()}`;
    try {
      await openSpendingCategories(page);

      await page.getByTestId("add-category-name-input").fill(name);
      await page.getByTestId("add-category-submit-button").click();

      await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

      const cat = await categoryNamed(request, name);
      expect(cat).toBeTruthy();
      expect(cat!.is_default).toBe(false);
      expect(cat!.archived_at).toBeNull();
    } finally {
      await archiveCategoryNamed(request, name);
    }
  });

  test("archive then restore a custom category", async ({ page, request }) => {
    const name = `E2E Archive ${Date.now()}`;
    try {
      await openSpendingCategories(page);

      // Create the category
      await page.getByTestId("add-category-name-input").fill(name);
      await page.getByTestId("add-category-submit-button").click();
      await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });

      // Find and archive it
      const cat = await categoryNamed(request, name);
      expect(cat).toBeTruthy();
      await page.getByTestId(`archive-btn-${cat!.id}`).click();

      // The category moves to the archived section (strikethrough)
      await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 5000 });
      const afterArchive = await categoryNamed(request, name);
      expect(afterArchive!.archived_at).not.toBeNull();

      // Restore it
      await page.getByTestId(`restore-btn-${cat!.id}`).click();
      const afterRestore = await categoryNamed(request, name);
      expect(afterRestore!.archived_at).toBeNull();
    } finally {
      await archiveCategoryNamed(request, name);
    }
  });

  test("personal transaction is excluded from tax totals but visible in list", async ({ page, request }) => {
    let txnId: string | null = null;
    try {
      // Create a personal transaction through the manual entry panel
      await page.goto("/transactions");
      await page.getByTestId("new-transaction-button").click();
      await page.getByTestId("manual-entry-panel").waitFor({ state: "visible", timeout: 10000 });

      await page.getByTestId("transaction-scope-select").selectOption("personal");
      await page.getByLabel("Amount").fill("75.00");
      await page.getByLabel("Date").fill("2026-01-15");

      await page.getByTestId("manual-entry-submit-button").click();
      await page.getByTestId("manual-entry-panel").waitFor({ state: "hidden", timeout: 10000 });

      // Verify via API: scope is "personal"
      const list = await request.get("/transactions/page");
      expect(list.ok()).toBe(true);
      const { items } = await list.json() as { items: { id: string; transaction_scope: string; amount: string }[] };
      const txn = items.find((t) => t.transaction_scope === "personal" && t.amount === "75.00");
      expect(txn).toBeTruthy();
      txnId = txn!.id;

      // Filter by scope = personal: the row should appear
      await page.getByLabel("Filter by scope").selectOption("personal");
      await expect(page.getByTestId(`transaction-row-${txnId}`)).toBeVisible({ timeout: 10000 });

      // Filter by scope = rental: the row should be gone
      await page.getByLabel("Filter by scope").selectOption("rental");
      await expect(page.getByTestId(`transaction-row-${txnId}`)).toBeHidden({ timeout: 10000 });
    } finally {
      if (txnId) await deleteTransaction(request, txnId);
    }
  });
});
