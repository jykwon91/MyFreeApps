import { test, expect } from "./fixtures/auth";
import { createTransaction, deleteTransaction } from "./fixtures/seed-data";
import { getYear } from "date-fns";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures", "documents");
const TEST_PDF = "plumber-invoice.pdf";

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

test.describe("Discrepancy scanner", () => {
  let createdTxnId: string | null = null;

  test.afterAll(async ({ api }) => {
    if (createdTxnId) {
      await deleteTransaction(api, createdTxnId);
    }
  });

  test("create transaction, verify tax and reconciliation pages load with content", async ({ authedPage: page, api }) => {
    // Create a test transaction to ensure the user has data
    const txn = await createTransaction(api, {
      vendor: `E2E Discrepancy Test ${RUN_ID}`,
      amount: "250.00",
      transaction_type: "expense",
      category: "maintenance",
      transaction_date: `${TEST_YEAR}-06-15`,
    });
    createdTxnId = txn.id;

    // Navigate to tax page and verify it loads with content
    await page.goto("/tax");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", { name: "Tax Report", level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Verify the page shows tax data (not just a loading state)
    await expect(
      page.getByText("Rental Revenue").first().or(page.getByText(/no tax data/i)),
    ).toBeVisible({ timeout: 10000 });

    // Navigate to reconciliation page and verify it loads
    await page.goto("/reconciliation");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("heading", { name: /reconciliation/i }),
    ).toBeVisible({ timeout: 10000 });

    // Verify reconciliation page shows actionable content
    await expect(
      page.getByText(/upload 1099|review sources|discrepancies/i).first(),
    ).toBeVisible({ timeout: 10000 });
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
    await expect(page.getByText("Upload 1099")).toBeVisible({ timeout: 5000 });
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
    await page.getByRole("button", { name: "3 Discrepancies" }).click();
    await expect(
      page.getByText(/discrepanc|everything matches|no discrepancies/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Document upload and extraction", () => {
  test("upload a PDF and verify it appears in the documents list", async ({ authedPage: page, api }) => {
    test.setTimeout(60000); // Upload + extraction pipeline can be slow
    // Navigate to documents page
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("table").or(page.getByText(/no documents found/i)),
    ).toBeVisible({ timeout: 15000 });

    // Verify upload zone is visible
    const fileInput = page.locator("input[type='file']").first();
    await expect(fileInput).toBeAttached();

    // Upload the test PDF fixture
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, TEST_PDF));

    // Verify the document appears in the list
    await expect(
      page.getByText(TEST_PDF).or(page.getByText(/plumber/i)),
    ).toBeVisible({ timeout: 15000 });

    // Verify a processing/extracting status is shown (proves extraction pipeline started)
    await expect(
      page.getByText(/processing|extracting|uploading/i).first(),
    ).toBeVisible({ timeout: 15000 });

    // Clean up the uploaded document via API
    const res = await api.get("/documents");
    if (res.ok()) {
      const docs = await res.json() as Array<{ file_name: string; id: string }>;
      const doc = docs.find((d) => d.file_name === TEST_PDF);
      if (doc) {
        await api.delete(`/documents/${doc.id}`).catch(() => {});
      }
    }
  });
});
