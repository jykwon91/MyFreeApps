/**
 * The Transactions page against a fresh organization seeded with
 * TRANSACTIONS_SEED, so the table always holds the same eight transactions:
 * seven approved ones and one that extraction flagged for review. Tests that
 * add a transaction delete it again, so the next test sees the same table.
 */
import { readFile } from "node:fs/promises";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { createTransaction, deleteTransaction } from "./fixtures/seed-data";
import { TRANSACTIONS_SEED as SEED, seedTransactionsPage } from "./fixtures/transactions-seed";

const org = seededOrg("transactions", seedTransactionsPage);

const POWER_BILL = SEED.approved.find((t) => t.vendor === "E2E Power Feb")!;
const PLUMBERS = SEED.approved.filter((t) => /plumber/i.test(t.vendor)).map((t) => t.vendor);

interface ListedTransaction {
  id: string;
  vendor: string | null;
  amount: string;
  status: string;
  transaction_date: string;
}

function rows(page: Page) {
  return page.locator("tbody tr");
}

function row(page: Page, vendor: string) {
  return rows(page).filter({ hasText: vendor });
}

function vendorFilter(page: Page) {
  return page.getByRole("textbox", { name: "Filter by vendor", exact: true });
}

async function findByVendor(api: APIRequestContext, vendor: string): Promise<ListedTransaction | undefined> {
  const res = await api.get("/transactions");
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as ListedTransaction[]).find((t) => t.vendor === vendor);
}

/** For cleanup: never throws, so it can't hide the test's own failure. */
async function deleteByVendor(api: APIRequestContext, vendor: string): Promise<void> {
  const res = await api.get("/transactions").catch(() => null);
  if (!res?.ok()) return;
  const found = ((await res.json()) as ListedTransaction[]).find((t) => t.vendor === vendor);
  if (found) await deleteTransaction(api, found.id);
}

async function openTransactions(page: Page): Promise<void> {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await expect(rows(page)).toHaveCount(SEED.count);
}

/** Adds a pending transaction for one test, and reloads so the table shows it. */
async function addPending(page: Page, vendor: string, amount: string): Promise<string> {
  const { id } = await createTransaction(org().api, { vendor, amount });
  await page.reload();
  await expect(row(page, vendor)).toBeVisible();
  return id;
}

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await openTransactions(page);
  });

  test.describe("Create transaction", () => {
    test("a manual transaction saves as pending and appears in the table", async ({ page }) => {
      const vendor = "E2E New Vendor";
      try {
        await page.getByRole("button", { name: /add transaction/i }).click();
        const form = page.getByRole("dialog", { name: /new transaction/i });
        await form.getByLabel(/^Date/).fill("2025-06-15");
        await form.getByLabel(/^Amount/).fill("75.00");
        await form.getByLabel(/^Vendor/).fill(vendor);
        await form.getByRole("button", { name: /create transaction/i }).click();

        await expect(page.getByRole("heading", { name: /new transaction/i })).toBeHidden();
        await expect(row(page, vendor)).toContainText("Pending");
        await expect(rows(page)).toHaveCount(SEED.count + 1);

        const saved = await findByVendor(org().api, vendor);
        expect(saved).toMatchObject({ amount: "75.00", status: "pending", transaction_date: "2025-06-15" });
      } finally {
        await deleteByVendor(org().api, vendor);
      }
    });

    test("cancel closes the new transaction form without creating", async ({ page }) => {
      await page.getByRole("button", { name: /add transaction/i }).click();
      await expect(page.getByRole("heading", { name: /new transaction/i })).toBeVisible();
      await page.getByRole("button", { name: /^cancel$/i }).first().click();
      await expect(page.getByRole("heading", { name: /new transaction/i })).toBeHidden();
      await expect(rows(page)).toHaveCount(SEED.count);
    });
  });

  test.describe("Edit panel", () => {
    test("clicking a row opens it with that transaction's details", async ({ page }) => {
      await row(page, POWER_BILL.vendor).click();

      const panel = page.getByRole("dialog", { name: POWER_BILL.vendor, exact: true });
      await expect(panel.getByRole("textbox", { name: "Vendor", exact: true })).toHaveValue(POWER_BILL.vendor);
      await expect(panel.getByLabel("Date", { exact: true })).toHaveValue(POWER_BILL.date);
      await expect(panel.getByLabel("Amount", { exact: true })).toHaveValue(POWER_BILL.amount);
    });

    test("a changed vendor is saved", async ({ page }) => {
      const id = await addPending(page, "E2E Edit Me", "99.00");
      try {
        await row(page, "E2E Edit Me").click();
        const panel = page.getByRole("dialog", { name: "E2E Edit Me" });
        await panel.getByRole("textbox", { name: "Vendor", exact: true }).fill("E2E Edited");
        await panel.getByRole("button", { name: /^save$/i }).click();

        await expect(row(page, "E2E Edited")).toBeVisible();
        await expect(row(page, "E2E Edit Me")).toHaveCount(0);
        await expect.poll(async () => (await findByVendor(org().api, "E2E Edited"))?.id).toBe(id);
      } finally {
        await deleteTransaction(org().api, id);
      }
    });

    test("approving a pending transaction marks it approved", async ({ page }) => {
      const id = await addPending(page, "E2E Approve Me", "55.00");
      try {
        await expect(row(page, "E2E Approve Me")).toContainText("Pending");
        await row(page, "E2E Approve Me").click();
        await page.getByRole("dialog", { name: "E2E Approve Me" }).getByRole("button", { name: /^approve$/i }).click();

        await expect(row(page, "E2E Approve Me").getByTitle("Approved")).toBeVisible();
        await expect(row(page, "E2E Approve Me")).not.toContainText("Pending");
        await expect.poll(async () => (await findByVendor(org().api, "E2E Approve Me"))?.status).toBe("approved");
      } finally {
        await deleteTransaction(org().api, id);
      }
    });

    test("delete asks first: cancel keeps the transaction, confirm deletes it", async ({ page }) => {
      let id: string | undefined = await addPending(page, "E2E Delete Me", "12.34");
      try {
        await row(page, "E2E Delete Me").click();
        const panel = page.getByRole("dialog", { name: "E2E Delete Me" });
        const confirm = page.getByRole("dialog", { name: "Delete transaction" });

        await panel.getByRole("button", { name: "Delete transaction" }).click();
        await expect(confirm).toContainText('"E2E Delete Me" transaction for $12.34');
        await confirm.getByRole("button", { name: "Cancel" }).click();
        await expect(confirm).toBeHidden();
        await expect(panel).toBeVisible();
        await expect(row(page, "E2E Delete Me")).toBeVisible();
        expect(await findByVendor(org().api, "E2E Delete Me")).toBeDefined();

        await panel.getByRole("button", { name: "Delete transaction" }).click();
        await confirm.getByRole("button", { name: "Delete", exact: true }).click();
        await expect(panel).toBeHidden();
        await expect(row(page, "E2E Delete Me")).toHaveCount(0);
        await expect.poll(() => findByVendor(org().api, "E2E Delete Me")).toBeUndefined();
        id = undefined;
      } finally {
        if (id) await deleteTransaction(org().api, id);
      }
    });
  });

  test.describe("A transaction extraction flagged", () => {
    test("shows Needs Review, and its panel says why", async ({ page }) => {
      const flagged = rows(page).filter({ hasText: "Needs Review" });
      await expect(flagged).toHaveCount(1);
      await expect(flagged).toContainText(SEED.flagged.vendor);

      await flagged.click();
      const panel = page.getByRole("dialog", { name: SEED.flagged.vendor });
      await expect(panel.getByText(SEED.flagged.review_reason, { exact: true })).toBeVisible();
    });

    test("links to its source document, which opens", async ({ page }) => {
      await row(page, SEED.flagged.vendor).click();
      const panel = page.getByRole("dialog", { name: SEED.flagged.vendor });

      await panel.getByRole("button", { name: `Open source document ${SEED.flagged.file_name}`, exact: true }).click();
      const image = page.getByRole("img", { name: "Source document" });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    });

    test("says so when its source document can't be opened", async ({ page }) => {
      let fail!: () => void;
      const held = new Promise<void>((resolve) => { fail = resolve; });
      await page.route("**/api/documents/*/download", async (route) => {
        await held;
        await route.fulfill({ status: 500, body: "storage down" });
      });
      await row(page, SEED.flagged.vendor).click();
      const panel = page.getByRole("dialog", { name: SEED.flagged.vendor });
      const source = panel.getByRole("button", { name: `Open source document ${SEED.flagged.file_name}`, exact: true });

      await source.click();
      await expect(source).toHaveAttribute("aria-disabled", "true");
      fail();

      await expect(page.getByText("I couldn't open the source document. Mind trying again?", { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: "Source document" })).toHaveCount(0);
      await expect(source).toHaveAttribute("aria-disabled", "false");
    });

    test("a manual transaction has no source document link", async ({ page }) => {
      await row(page, POWER_BILL.vendor).click();
      const panel = page.getByRole("dialog", { name: POWER_BILL.vendor, exact: true });
      await expect(panel.getByRole("textbox", { name: "Vendor", exact: true })).toBeVisible();
      await expect(panel.getByRole("button", { name: /open source document/i })).toHaveCount(0);
    });
  });

  test.describe("Selection", () => {
    test("selecting rows shows the bulk bar with the count, and Clear selection hides it", async ({ page }) => {
      const checkboxes = page.locator("tbody input[type='checkbox']");
      await expect(checkboxes).toHaveCount(SEED.count);

      await checkboxes.nth(0).check();
      await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
      await checkboxes.nth(1).check();
      await expect(page.getByText("2 selected", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Clear selection" }).click();
      await expect(page.getByText(/\d+ selected/)).toBeHidden();
      await expect(checkboxes.nth(0)).not.toBeChecked();
    });
  });

  test.describe("Vendor filter", () => {
    test("narrows the table to the vendor, and clearing it shows every transaction", async ({ page }) => {
      await vendorFilter(page).fill("E2E Plumber Jan");
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText("E2E Plumber Jan");

      await vendorFilter(page).fill("");
      await expect(rows(page)).toHaveCount(SEED.count);
    });

    test("on a phone the filters open from the Filters button, which counts the active ones", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const cards = page.getByTestId("transaction-cards").locator(":scope > *");
      await expect(cards).toHaveCount(SEED.count);

      await expect(vendorFilter(page)).toBeHidden();
      const toggle = page.getByRole("button", { name: "Filters", exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      await vendorFilter(page).fill("E2E Plumber Jan");
      await expect(cards).toHaveCount(1);
      await expect(cards).toContainText("E2E Plumber Jan");
      await expect(page.getByRole("button", { name: "Filters, 1 on" })).toHaveAttribute("aria-expanded", "true");

      await page.getByRole("button", { name: "Clear filters" }).click();
      await expect(cards).toHaveCount(SEED.count);
      const cleared = page.getByRole("button", { name: "Filters", exact: true });
      await expect(cleared).toBeVisible();

      await cleared.click();
      await expect(cleared).toHaveAttribute("aria-expanded", "false");
      await expect(vendorFilter(page)).toBeHidden();
    });

    test("on a larger screen the filters always show, without a Filters button", async ({ page }) => {
      await expect(vendorFilter(page)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Filters/ })).toBeHidden();
    });

    test("matches part of the vendor, ignoring case", async ({ page }) => {
      await vendorFilter(page).fill("plumber");
      await expect(rows(page)).toHaveCount(PLUMBERS.length);
      for (const vendor of PLUMBERS) await expect(row(page, vendor)).toBeVisible();
    });
  });

  test.describe("Export", () => {
    test("export button shows CSV and PDF options", async ({ page }) => {
      await page.getByRole("button", { name: /export/i }).click();
      await expect(page.getByText("Export CSV")).toBeVisible();
      await expect(page.getByText("Export PDF")).toBeVisible();
    });

    test("Export CSV downloads every transaction", async ({ page }) => {
      await page.getByRole("button", { name: /export/i }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("menuitem", { name: /export csv/i }).click(),
      ]);
      expect(download.suggestedFilename()).toBe("transactions.csv");
      const csv = await readFile(await download.path(), "utf8");
      for (const t of [...SEED.approved, SEED.flagged]) expect(csv).toContain(t.vendor);
    });
  });

  test.describe("Export with a vendor filter", () => {
    test("Export CSV holds only the vendors the filter shows", async ({ page }) => {
      await vendorFilter(page).fill("plumber");
      await expect(rows(page)).toHaveCount(PLUMBERS.length);

      await page.getByRole("button", { name: /export/i }).click();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("menuitem", { name: /export csv/i }).click(),
      ]);
      const csv = await readFile(await download.path(), "utf8");
      for (const vendor of PLUMBERS) expect(csv).toContain(vendor);
      const others = [...SEED.approved, SEED.flagged].filter((t) => !/plumber/i.test(t.vendor));
      expect(others.length).toBeGreaterThan(0);
      for (const t of others) expect(csv).not.toContain(t.vendor);
    });
  });

  test.describe("Toolbar panels", () => {
    test("opens and closes the vendor rules panel", async ({ page }) => {
      await page.getByRole("button", { name: /vendor rules/i }).click();
      await expect(page.getByText("Classification Rules").first()).toBeVisible();
      await page.getByRole("button", { name: /close panel/i }).click();
      await expect(page.getByText("Classification Rules")).toBeHidden();
    });

    test("opens and closes the bank statement import", async ({ page }) => {
      await page.getByRole("button", { name: /import/i }).click();
      await expect(page.getByRole("heading", { name: /import bank statement/i })).toBeVisible();
      await page.getByRole("button", { name: /close import modal/i }).click();
      await expect(page.getByRole("heading", { name: /import bank statement/i })).toBeHidden();
    });
  });

  test.describe("Duplicates tab", () => {
    const noDuplicates = (page: Page) => page.getByText(/No suspected duplicates right now/);

    test("switches view, updates the URL, and hides transaction-only actions", async ({ page }) => {
      await page.getByRole("button", { name: /Duplicates/ }).first().click();
      await expect(page).toHaveURL(/tab=duplicates/);
      await expect(noDuplicates(page)).toBeVisible();
      await expect(vendorFilter(page)).toBeHidden();
      await expect(page.getByRole("button", { name: "Add Transaction" })).toBeHidden();
    });

    test("opens directly from the URL, and switching back restores the table", async ({ page }) => {
      await page.goto("/transactions?tab=duplicates");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
      await expect(noDuplicates(page)).toBeVisible();

      // The page's tab, not the sidebar link.
      const txnTab = page.getByRole("main").getByRole("button", { name: "Transactions", exact: true });
      await expect(txnTab).toBeEnabled();
      await txnTab.click();
      await expect(page).toHaveURL(/\/transactions(?!\?tab)/);
      await expect(rows(page)).toHaveCount(SEED.count);
      await expect(vendorFilter(page)).toBeVisible();
    });
  });
});
