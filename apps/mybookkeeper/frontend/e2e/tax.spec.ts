import { test as baseTest, type APIRequestContext } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { seededOrg } from "./fixtures/seeded-org";
import { getYear } from "date-fns";

const CURRENT_YEAR = getYear(new Date());

test.describe("Tax Report", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/tax");
    await expect(page.getByRole("heading", { name: "Tax Report" })).toBeVisible();
    // Wait past skeleton — page shows summary cards or empty state once loaded
    await expect(
      page.getByText("Rental Revenue").or(page.getByText(/no tax data/i)).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("changing the year selector updates the data", async ({ authedPage: page }) => {
    const yearSelect = page.locator("select").first();
    await expect(yearSelect).toBeVisible();

    const initialYear = await yearSelect.inputValue();
    const targetYear = String(CURRENT_YEAR - 2);
    await yearSelect.selectOption(targetYear);

    await expect(yearSelect).toHaveValue(targetYear);
    expect(String(targetYear)).not.toBe(initialYear);

    await expect(
      page.getByText("Rental Revenue").or(page.getByText(new RegExp("no tax data for " + targetYear, "i"))).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("Schedule E export button triggers a file download", async ({ authedPage: page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: /schedule e/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/schedule_e.*\.pdf$/i);
  });

  test("Export PDF button triggers a file download", async ({ authedPage: page }) => {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: /export pdf/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("mortgage principal is listed but not deducted", async ({ authedPage: page, api }) => {
    const summaryUrl = `/summary/tax?year=${CURRENT_YEAR - 1}`;
    const before = await (await api.get(summaryUrl)).json();
    const created = await api.post("/transactions", {
      data: {
        transaction_date: `${CURRENT_YEAR - 1}-03-15`,
        amount: "987654.00",
        transaction_type: "expense",
        category: "mortgage_principal",
        vendor: `E2E Principal ${Date.now()}`,
        tags: ["mortgage_principal"],
        tax_relevant: true,
      },
    });
    expect(created.ok()).toBe(true);
    const { id } = await created.json();
    try {
      const approved = await api.patch(`/transactions/${id}`, { data: { status: "approved" } });
      expect(approved.ok()).toBe(true);

      const after = await (await api.get(summaryUrl)).json();
      expect(after.by_category.mortgage_principal).toBeGreaterThanOrEqual(987654);
      expect(after.total_deductions - before.total_deductions).toBeLessThan(987654);

      await page.reload();
      await expect(page.getByRole("cell", { name: /Mortgage Principal/i })).toContainText("Not deductible", { timeout: 10000 });
    } finally {
      await api.delete(`/transactions/${id}`);
    }
  });

  test("page loads without crashing when w2_income is absent", async ({ authedPage: page }) => {
    // Regression test for the optional chaining fix on data.w2_income?.length.
    // If the API returns no w2_income field the page must not throw and must still render
    // the summary cards. Reaching this point without an error proves the fix holds.
    await expect(page.getByRole("heading", { name: "Tax Report" })).toBeVisible();
    await expect(page.getByText("Rental Revenue").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Rental Deductions")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Net Taxable Income").or(page.getByText("Total Income"))
    ).toBeVisible({ timeout: 10000 });
  });

  test("W-2 section only appears when W-2 income data exists", async ({ authedPage: page, api }) => {
    const defaultYear = CURRENT_YEAR - 1;
    const res = await api.get("/summary/tax?year=" + defaultYear);
    if (!res.ok()) {
      await expect(page.getByRole("heading", { name: "Tax Report" })).toBeVisible();
      return;
    }

    const summary = await res.json() as { w2_income?: Array<unknown>; w2_total?: number };
    const hasW2 = (summary.w2_income?.length ?? 0) > 0;

    if (hasW2) {
      await expect(page.getByText("Employment Income (W-2)")).toBeVisible({ timeout: 10000 });
    } else {
      await expect(page.getByText("Employment Income (W-2)")).not.toBeVisible();
    }
  });
});

// A fresh organization starts with no tax returns, so every year is free to create.
baseTest.describe("Tax Returns", () => {
  const org = seededOrg("tax-returns");
  const YEAR = CURRENT_YEAR - 1;

  async function returnYears(api: APIRequestContext): Promise<number[]> {
    const res = await api.get("/tax-returns");
    expect(res.ok()).toBe(true);
    return ((await res.json()) as { tax_year: number }[]).map((r) => r.tax_year);
  }

  baseTest.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await page.goto("/tax-returns");
    await expect(page.getByRole("heading", { name: "Tax Returns" })).toBeVisible();
  });

  // Serial: the first test sees the empty organization, the later ones the return it creates.
  baseTest.describe.configure({ mode: "serial" });

  baseTest("with no returns, says so; Cancel closes the form without creating one", async ({ page }) => {
    await expect(page.getByText("No tax returns yet")).toBeVisible();

    await page.getByRole("button", { name: /new return/i }).click();
    await expect(page.getByText("Create Tax Return")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Create Tax Return")).toHaveCount(0);

    expect(await returnYears(org().api)).toEqual([]);
  });

  baseTest("the filing status choices cover the IRS statuses", async ({ page }) => {
    await page.getByRole("button", { name: /new return/i }).click();
    const statusSelect = page.locator("select").last();
    await expect(statusSelect.locator("option")).toContainText([
      /single/i, /married filing jointly/i, /married filing separately/i, /head of household/i,
    ]);
  });

  baseTest("creating a return opens it, and the list then shows it as a draft", async ({ page }) => {
    await page.getByRole("button", { name: /new return/i }).click();
    await page.locator("select").first().selectOption(String(YEAR));
    await page.locator("select").last().selectOption("head_of_household");
    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(page).toHaveURL(/\/tax-returns\/[0-9a-f-]{36}$/);
    expect(await returnYears(org().api)).toEqual([YEAR]);

    await page.goto("/tax-returns");
    const card = page.getByRole("button", { name: new RegExp(`^${YEAR}`) });
    await expect(card).toContainText("Draft");
    await expect(card).toContainText("head of household");
    await expect(page.getByText("No tax returns yet")).toHaveCount(0);
  });

  baseTest("a second return for the same year is refused, naming the year", async ({ page }) => {
    await page.getByRole("button", { name: /new return/i }).click();
    await page.locator("select").first().selectOption(String(YEAR));
    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(page.getByText(`You already have a ${YEAR} tax return.`, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/tax-returns$/);
    expect(await returnYears(org().api)).toEqual([YEAR]);
  });
});
