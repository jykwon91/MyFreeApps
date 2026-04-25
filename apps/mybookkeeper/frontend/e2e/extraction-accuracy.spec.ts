import { test, expect } from "./fixtures/auth";
import type { APIRequestContext, Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures", "documents");

interface ExpectedTransaction {
  vendor: string;
  amount: number;
  transaction_date: string;
  transaction_type: string;
  category: string;
  tax_relevant: boolean;
}

interface ExpectedManifest {
  description: string;
  document_type?: string;
  expected_transactions: ExpectedTransaction[];
  expected_count: number;
  expected_metadata?: Record<string, unknown>;
  expected_reservations?: boolean;
  note?: string;
}

function loadExpected(name: string): ExpectedManifest {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, `${name}.expected.json`), "utf-8");
  return JSON.parse(raw);
}

async function uploadAndWaitForExtraction(page: Page, api: APIRequestContext, filename: string): Promise<void> {
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles(path.join(FIXTURES_DIR, `${filename}.pdf`));

  // Poll for extraction completion via authenticated API
  await expect(async () => {
    const res = await api.get("/documents?exclude_processing=false");
    const docs = await res.json();
    const doc = docs.find((d: { file_name: string }) => d.file_name === `${filename}.pdf`);
    expect(doc).toBeTruthy();
    expect(doc.status).not.toBe("processing");
  }).toPass({ timeout: 60000, intervals: [2000, 3000, 5000] });
}

async function deleteTestDocuments(api: APIRequestContext, filenames: string[]): Promise<void> {
  const res = await api.get("/documents");
  if (!res.ok()) return;
  const docs = await res.json();
  const pdfNames = new Set(filenames.map((n) => `${n}.pdf`));
  for (const doc of docs) {
    if (pdfNames.has(doc.file_name)) {
      await api.delete(`/documents/${doc.id}`);
    }
  }
}

const RUN_EXTRACTION = !!process.env.RUN_EXTRACTION_TESTS;

// Extraction tests wait for Claude API — need longer timeout than UI tests
const EXTRACTION_TIMEOUT = 90_000;

// ─── Schedule E: Rental Property Invoices ────────────────────────────────────

test.describe("Extraction accuracy — Rental property expenses", () => {
  test.skip(!RUN_EXTRACTION, "Skipped — set RUN_EXTRACTION_TESTS=1 to run");
  test.setTimeout(EXTRACTION_TIMEOUT);
  const rentalDocs = [
    "plumber-invoice",
    "electrician-invoice",
    "electric-bill",
    "insurance-policy",
    "property-management",
    "cleaning-service",
    "property-tax",
    "landscaping",
    "furniture-purchase",
    "attorney-invoice",
    "advertising-invoice",
  ];

  test.afterAll(async ({ api }) => {
    await deleteTestDocuments(api, rentalDocs);
  });

  for (const docName of rentalDocs) {
    const expected = loadExpected(docName);

    test(`${docName}: extracts correct vendor, amount, date, category`, async ({ authedPage: page, api }) => {
      await uploadAndWaitForExtraction(page, api, docName);

      const res = await api.get("/transactions");
      const transactions = await res.json();
      const matches = transactions.filter(
        (t: { source_file_name: string }) => t.source_file_name === `${docName}.pdf`
      );

      expect(matches.length).toBe(expected.expected_count);

      for (let i = 0; i < expected.expected_transactions.length; i++) {
        const exp = expected.expected_transactions[i];
        const actual = matches[i];

        expect(actual.vendor).toBe(exp.vendor);
        expect(parseFloat(actual.amount)).toBeCloseTo(exp.amount, 2);
        expect(actual.transaction_date).toContain(exp.transaction_date);
        expect(actual.transaction_type).toBe(exp.transaction_type);
        expect(actual.category).toBe(exp.category);
        expect(actual.tax_relevant).toBe(exp.tax_relevant);
      }
    });
  }
});

// ─── Schedule C: Self-Employed Documents ─────────────────────────────────────

test.describe("Extraction accuracy — Self-employed expenses", () => {
  test.skip(!RUN_EXTRACTION, "Skipped — set RUN_EXTRACTION_TESTS=1 to run");
  test.setTimeout(EXTRACTION_TIMEOUT);
  const selfEmployedDocs = [
    "consulting-revenue",
    "office-supplies",
    "software-subscription",
  ];

  test.afterAll(async ({ api }) => {
    await deleteTestDocuments(api, selfEmployedDocs);
  });

  for (const docName of selfEmployedDocs) {
    const expected = loadExpected(docName);

    test(`${docName}: extracts correct vendor, amount, date`, async ({ authedPage: page, api }) => {
      await uploadAndWaitForExtraction(page, api, docName);

      const res = await api.get("/transactions");
      const transactions = await res.json();
      const matches = transactions.filter(
        (t: { source_file_name: string }) => t.source_file_name === `${docName}.pdf`
      );

      expect(matches.length).toBe(expected.expected_count);

      for (let i = 0; i < expected.expected_transactions.length; i++) {
        const exp = expected.expected_transactions[i];
        const actual = matches[i];

        expect(actual.vendor).toBe(exp.vendor);
        expect(parseFloat(actual.amount)).toBeCloseTo(exp.amount, 2);
        expect(actual.transaction_date).toContain(exp.transaction_date);
        expect(actual.transaction_type).toBe(exp.transaction_type);
        expect(actual.category).not.toBe("uncategorized");
      }
    });
  }
});

// ─── Tax Forms (1099s) ───────────────────────────────────────────────────────

test.describe("Extraction accuracy — Tax forms", () => {
  test.skip(!RUN_EXTRACTION, "Skipped — set RUN_EXTRACTION_TESTS=1 to run");
  test.setTimeout(EXTRACTION_TIMEOUT);
  const taxFormDocs = ["1099-nec-client", "1099-k-airbnb"];

  test.afterAll(async ({ api }) => {
    await deleteTestDocuments(api, taxFormDocs);
  });

  test("1099-NEC: extracts form metadata, not expense transactions", async ({ authedPage: page, api }) => {
    await uploadAndWaitForExtraction(page, api, "1099-nec-client");

    const res = await api.get("/transactions");
    const transactions = await res.json();
    const matches = transactions.filter(
      (t: { source_file_name: string }) => t.source_file_name === "1099-nec-client.pdf"
    );

    const expenses = matches.filter((t: { transaction_type: string }) => t.transaction_type === "expense");
    expect(expenses.length).toBe(0);
  });

  test("1099-K: extracts form metadata, not expense transactions", async ({ authedPage: page, api }) => {
    await uploadAndWaitForExtraction(page, api, "1099-k-airbnb");

    const res = await api.get("/transactions");
    const transactions = await res.json();
    const matches = transactions.filter(
      (t: { source_file_name: string }) => t.source_file_name === "1099-k-airbnb.pdf"
    );

    const expenses = matches.filter((t: { transaction_type: string }) => t.transaction_type === "expense");
    expect(expenses.length).toBe(0);
  });
});

// ─── Year-End Statements ─────────────────────────────────────────────────────

test.describe("Extraction accuracy — Year-end statements", () => {
  test.skip(!RUN_EXTRACTION, "Skipped — set RUN_EXTRACTION_TESTS=1 to run");
  test.setTimeout(EXTRACTION_TIMEOUT);
  const yearEndDocs = ["airbnb-year-end"];

  test.afterAll(async ({ api }) => {
    await deleteTestDocuments(api, yearEndDocs);
  });

  test("Airbnb year-end: should NOT create individual expense transactions", async ({ authedPage: page, api }) => {
    await uploadAndWaitForExtraction(page, api, "airbnb-year-end");

    const res = await api.get("/transactions");
    const transactions = await res.json();
    const matches = transactions.filter(
      (t: { source_file_name: string }) => t.source_file_name === "airbnb-year-end.pdf"
    );

    const expenses = matches.filter((t: { transaction_type: string }) => t.transaction_type === "expense");
    expect(expenses.length).toBe(0);
  });
});

// ─── Multi-Item Invoice ──────────────────────────────────────────────────────

test.describe("Extraction accuracy — Multi-item documents", () => {
  test.skip(!RUN_EXTRACTION, "Skipped — set RUN_EXTRACTION_TESTS=1 to run");
  test.setTimeout(EXTRACTION_TIMEOUT);
  const multiItemDocs = ["multi-item-invoice"];

  test.afterAll(async ({ api }) => {
    await deleteTestDocuments(api, multiItemDocs);
  });

  test("multi-item invoice: single transaction with total amount", async ({ authedPage: page, api }) => {
    const expected = loadExpected("multi-item-invoice");
    await uploadAndWaitForExtraction(page, api, "multi-item-invoice");

    const res = await api.get("/transactions");
    const transactions = await res.json();
    const matches = transactions.filter(
      (t: { source_file_name: string }) => t.source_file_name === "multi-item-invoice.pdf"
    );

    expect(matches.length).toBe(expected.expected_count);

    const actual = matches[0];
    expect(actual.vendor).toBe(expected.expected_transactions[0].vendor);
    expect(parseFloat(actual.amount)).toBeCloseTo(expected.expected_transactions[0].amount, 2);
    expect(actual.transaction_type).toBe("expense");
    expect(actual.category).toBe("maintenance");
  });
});

// ─── Data Integrity Checks Across All Extractions ────────────────────────────

test.describe("Extraction data integrity", () => {
  test.skip(!RUN_EXTRACTION, "Skipped — set RUN_EXTRACTION_TESTS=1 to run");
  test.setTimeout(EXTRACTION_TIMEOUT);
  test("all transactions have required fields", async ({ api }) => {
    const res = await api.get("/transactions");
    const transactions = await res.json();

    for (const txn of transactions) {
      expect(txn.id).toBeTruthy();
      expect(txn.amount).toBeTruthy();
      expect(parseFloat(txn.amount)).toBeGreaterThan(0);
      expect(txn.transaction_date).toBeTruthy();
      expect(txn.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(["income", "expense"]).toContain(txn.transaction_type);
      expect(txn.category).toBeTruthy();
      expect(["pending", "approved", "needs_review", "duplicate", "unverified"]).toContain(txn.status);
    }
  });

  test("no floating point artifacts in amounts", async ({ api }) => {
    const res = await api.get("/transactions");
    const transactions = await res.json();

    for (const txn of transactions) {
      const amount = parseFloat(txn.amount);
      const rounded = Math.round(amount * 100) / 100;
      expect(amount).toBeCloseTo(rounded, 2);
    }
  });

  test("dates are within reasonable range", async ({ api }) => {
    const res = await api.get("/transactions");
    const transactions = await res.json();

    const minDate = new Date("2020-01-01");
    const maxDate = new Date("2030-12-31");

    for (const txn of transactions) {
      const date = new Date(txn.transaction_date);
      expect(date.getTime()).toBeGreaterThanOrEqual(minDate.getTime());
      expect(date.getTime()).toBeLessThanOrEqual(maxDate.getTime());
    }
  });

  test("categories are valid enum values", async ({ api }) => {
    const validCategories = [
      "rental_revenue", "cleaning_fee_revenue",
      "maintenance", "contract_work", "cleaning_expense", "utilities",
      "management_fee", "insurance", "mortgage_interest", "mortgage_principal",
      "taxes", "channel_fee", "advertising", "legal_professional", "travel",
      "furnishings", "other_expense", "uncategorized",
    ];

    const res = await api.get("/transactions");
    const transactions = await res.json();

    for (const txn of transactions) {
      expect(validCategories).toContain(txn.category);
    }
  });
});
