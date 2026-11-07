/**
 * Tax Documents — the year → form → issuer accordion, the year filter and the
 * source-document viewer. Runs against fresh organizations so the documents
 * on the page are exactly the ones seeded here.
 */
import { test, expect, type Page } from "@playwright/test";
import { test as authedTest } from "./fixtures/auth";
import { seededOrg } from "./fixtures/seeded-org";
import { TAX_DOCS_SEED, seedTaxDocuments } from "./fixtures/tax-documents-seed";

const [ACME_W2, CREDIT_UNION_INT, HARBOR_INT] = TAX_DOCS_SEED.forms;

authedTest.describe("Tax Documents — navigation", () => {
  authedTest("the sidebar's Tax Documents link opens the page", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Tax Documents" }).click();
    await expect(page).toHaveURL(/\/tax-documents$/);
    await expect(page.getByRole("heading", { name: "Tax Documents" })).toBeVisible();
  });
});

function yearTrigger(page: Page, year: number) {
  return page.getByRole("button", { name: new RegExp(`^${year}\\b`) });
}

function issuerRow(page: Page, issuer: string) {
  return page.getByText(issuer, { exact: true }).locator("xpath=ancestor::div[contains(@class,'border-t')][1]");
}

test.describe("Tax Documents — with forms in two years", () => {
  const org = seededOrg("tax-documents", seedTaxDocuments);

  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
    await page.goto("/tax-documents");
    await expect(page.getByRole("heading", { name: "Tax Documents" })).toBeVisible();
  });

  test("years are listed newest first with their counts, and the newest is open", async ({ page }) => {
    await expect(yearTrigger(page, 2025)).toContainText("2");
    await expect(yearTrigger(page, 2025)).toHaveAttribute("aria-expanded", "true");
    await expect(yearTrigger(page, 2024)).toContainText("1");
    await expect(yearTrigger(page, 2024)).toHaveAttribute("aria-expanded", "false");
    // A closed year names the forms inside it.
    await expect(yearTrigger(page, 2024)).toContainText("1099-INT");

    const years = await page.getByRole("button", { name: /^20\d\d\b/ }).allTextContents();
    expect(years.map((t) => t.slice(0, 4))).toEqual(["2025", "2024"]);
  });

  test("the open year groups its issuers under each form", async ({ page }) => {
    await expect(issuerRow(page, ACME_W2.issuer)).toBeVisible();
    await expect(issuerRow(page, CREDIT_UNION_INT.issuer)).toBeVisible();
    await expect(page.getByRole("button", { name: /^W-2\s*1$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^1099-INT\s*1$/ })).toBeVisible();
    await expect(page.getByText(HARBOR_INT.issuer, { exact: true })).toHaveCount(0);

    // An older year opens with its forms closed.
    await yearTrigger(page, 2024).click();
    await expect(page.getByText(HARBOR_INT.issuer, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^1099-INT\s*1$/ }).last().click();
    await expect(issuerRow(page, HARBOR_INT.issuer)).toBeVisible();
  });

  test("the year filter shows only that year's forms", async ({ page }) => {
    const yearSelect = page.locator("select");
    await expect(yearSelect.locator("option")).toHaveText(["All Years", "2025", "2024"]);

    // The chosen year opens with its forms showing.
    await yearSelect.selectOption("2024");
    await expect(yearTrigger(page, 2024)).toHaveAttribute("aria-expanded", "true");
    await expect(issuerRow(page, HARBOR_INT.issuer)).toBeVisible();
    await expect(yearTrigger(page, 2025)).toHaveCount(0);
    await expect(page.getByText(ACME_W2.issuer, { exact: true })).toHaveCount(0);

    await yearSelect.selectOption("");
    await expect(yearTrigger(page, 2025)).toBeVisible();
    await expect(yearTrigger(page, 2024)).toBeVisible();
  });

  test("View opens the form's source document", async ({ page }) => {
    await issuerRow(page, ACME_W2.issuer).getByRole("button", { name: "View" }).click();
    await expect(page.getByText("Source document")).toBeVisible();
  });
});

test.describe("Tax Documents — with no forms", () => {
  const org = seededOrg("tax-documents-empty");

  test("says there are none and points to Documents", async ({ page }) => {
    await org().signIn(page);
    await page.goto("/tax-documents");
    await expect(page.getByText("No tax documents yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Documents", exact: true }).last()).toHaveAttribute("href", "/documents");
    await expect(page.locator("select")).toHaveCount(0);
  });
});
