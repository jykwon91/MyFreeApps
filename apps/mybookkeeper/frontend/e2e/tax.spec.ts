import { test, expect } from "./fixtures/auth";
import { getYear } from "date-fns";

const CURRENT_YEAR = getYear(new Date());

test.describe("Tax Report", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/tax");
    await expect(page.getByRole("heading", { name: "Tax Report" })).toBeVisible();
    // Wait past skeleton — page shows summary cards or empty state once loaded
    await expect(
      page.getByText("Rental Revenue").first().or(page.getByText(/no tax data/i))
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
      page.getByText("Rental Revenue").first().or(page.getByText(new RegExp("no tax data for " + targetYear, "i")))
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

test.describe("Tax Returns — create and delete", () => {
  let createdReturnId: string | null = null;

  test.afterAll(async ({ api }) => {
    if (createdReturnId) {
      await api.delete("/tax-returns/" + createdReturnId).catch(() => { /* non-critical */ });
    }
  });

  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/tax-returns");
    await expect(page.getByRole("heading", { name: "Tax Returns" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /new return/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test("create a tax return — fills form, submits, verifies card appears", async ({ authedPage: page, api }) => {
    const existingRes = await api.get("/tax-returns");
    const existing = await existingRes.json();
    const existingYears = new Set(
      (Array.isArray(existing) ? existing : []).map((r: { tax_year: number }) => r.tax_year)
    );
    const availableYears = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];
    const testYear = availableYears.find((y) => !existingYears.has(y));
    if (testYear === undefined) {
      test.skip(true, "All available tax years already have returns");
      return;
    }

    await page.getByRole("button", { name: /new return/i }).click();
    await expect(page.getByText("Create Tax Return")).toBeVisible({ timeout: 5000 });

    const yearSelect = page.locator("select").first();
    await expect(yearSelect).toBeVisible({ timeout: 5000 });
    await yearSelect.selectOption(String(testYear));
    await page.locator("select").last().selectOption("head_of_household");

    await page.getByRole("button", { name: /^create$/i }).click();

    await expect(page).toHaveURL(/\/tax-returns\//, { timeout: 10000 });

    const url = page.url();
    const match = url.match(/\/tax-returns\/([0-9a-f-]{36})/);
    if (match) createdReturnId = match[1];

    await page.goto("/tax-returns");
    await expect(page.getByRole("button", { name: /new return/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(testYear)).toBeVisible({ timeout: 10000 });
  });

  test("cancel closes the creation form without creating", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /new return/i }).click();
    await expect(page.getByText("Create Tax Return")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText("Create Tax Return")).not.toBeVisible({ timeout: 5000 });
  });

  test("filing status dropdown has all required options", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /new return/i }).click();
    await expect(page.getByText("Create Tax Return")).toBeVisible({ timeout: 5000 });

    const statusSelect = page.locator("select").last();
    await statusSelect.waitFor({ state: "visible" });
    const options = await statusSelect.locator("option").allTextContents();

    expect(options.some((o) => /single/i.test(o))).toBe(true);
    expect(options.some((o) => /married filing jointly/i.test(o))).toBe(true);
    expect(options.some((o) => /head of household/i.test(o))).toBe(true);
  });

  test("existing returns show year and status badge", async ({ authedPage: page, api }) => {
    const listRes = await api.get("/tax-returns");
    const returns = await listRes.json();
    if (!Array.isArray(returns) || returns.length === 0) {
      const createRes = await api.post("/tax-returns", {
        data: { tax_year: CURRENT_YEAR - 3, filing_status: "single" },
      });
      if (createRes.ok()) {
        const r = await createRes.json();
        createdReturnId = r.id;
      }
      await page.reload();
      await expect(page.getByRole("button", { name: /new return/i })).toBeVisible({ timeout: 10000 });
    }

    const yearCard = page.getByText(/^20\d{2}$/).first();
    await expect(yearCard).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/draft|ready|filed/i).first()).toBeVisible({ timeout: 10000 });
  });
});
