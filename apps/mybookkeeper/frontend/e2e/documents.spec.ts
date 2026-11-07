import type { Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { deleteDocumentsNamed, docIdsNamed, seedDocument, uniquePdf } from "./fixtures/documents";

// Only this file uploads documents, and the upload zone takes one upload at a
// time across the workspace, so its tests run in order rather than in parallel.
test.describe.configure({ mode: "default" });

test.describe("Documents — upload, verify, delete", () => {
  test.describe.configure({ timeout: 90_000 });
  // The list is shared with other specs and paged, so narrow it to this test's files.
  async function openDocuments(page: Page, search: string): Promise<void> {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(page.locator("table").or(page.getByText(/no documents found/i)).first()).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("Search by file name...").fill(search);
  }

  function prefixFor(testInfo: TestInfo, label: string): string {
    return `e2e-doc-${label}-${Date.now()}-${testInfo.workerIndex}`;
  }

  test("uploading a PDF adds it to the list", async ({ authedPage: page, api }, testInfo) => {
    const name = `${prefixFor(testInfo, "upload")}.pdf`;
    try {
      await openDocuments(page, name);

      await page.locator("input[type='file']").first().setInputFiles(uniquePdf(name));

      // The list leaves out documents still being read, so the row shows once extraction ends.
      await expect(page.locator("tbody tr", { hasText: name })).toBeVisible({ timeout: 60000 });
      const ids = await docIdsNamed(api, name);
      expect(ids).toHaveLength(1);

      // The upload card reports how extraction actually ended, not success regardless.
      const res = await api.get(`/documents/upload-status/${ids[0]}`);
      expect(res.ok(), await res.text()).toBe(true);
      const { status } = (await res.json()) as { status: string };
      expect(status).toMatch(/^(completed|failed)$/);
      const card = status === "completed" ? /Got it!/ : /I had trouble reading this one/;
      await expect(page.getByText(`${name} —`, { exact: false })).toContainText(card);
    } finally {
      await deleteDocumentsNamed(api, name);
    }
  });

  test("deleting a document asks first, then removes it", async ({ authedPage: page, api }, testInfo) => {
    const name = `${prefixFor(testInfo, "delete")}.pdf`;
    try {
      await seedDocument(api, name);
      await openDocuments(page, name);
      const row = page.locator("tbody tr", { hasText: name });
      await expect(row).toBeVisible({ timeout: 15000 });

      await row.getByRole("button", { name: "Delete document" }).click();
      const confirm = page.getByRole("dialog", { name: "Delete document", exact: true });
      await expect(confirm).toContainText(`Are you sure you want to delete ${name}?`);
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();

      await expect(confirm).toBeHidden();
      await expect(row).toHaveCount(0, { timeout: 10000 });
      expect(await docIdsNamed(api, name)).toEqual([]);
    } finally {
      await deleteDocumentsNamed(api, name);
    }
  });

  test("select-all selects only the rows shown, and unchecking clears them", async ({ authedPage: page, api }, testInfo) => {
    const prefix = prefixFor(testInfo, "select");
    try {
      await Promise.all([seedDocument(api, `${prefix}-a.pdf`), seedDocument(api, `${prefix}-b.pdf`)]);
      await openDocuments(page, prefix);
      await expect(page.locator("tbody tr", { hasText: prefix })).toHaveCount(2, { timeout: 15000 });

      const selectAll = page.getByLabel("Select all documents");
      await selectAll.check();
      await expect(page.getByLabel(`Select ${prefix}-a.pdf`)).toBeChecked();
      await expect(page.getByLabel(`Select ${prefix}-b.pdf`)).toBeChecked();
      await expect(page.getByText("2 selected", { exact: true })).toBeVisible();

      await selectAll.uncheck();
      await expect(page.locator("tbody input[type='checkbox']:checked")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Delete selected" })).toBeHidden();
    } finally {
      await deleteDocumentsNamed(api, prefix);
    }
  });

  test("bulk delete asks first: cancel keeps the documents, confirm deletes them", async ({ authedPage: page, api }, testInfo) => {
    const prefix = prefixFor(testInfo, "bulk");
    const names = [`${prefix}-a.pdf`, `${prefix}-b.pdf`];
    try {
      await Promise.all(names.map((name) => seedDocument(api, name)));
      await openDocuments(page, prefix);
      const rows = page.locator("tbody tr", { hasText: prefix });
      await expect(rows).toHaveCount(2, { timeout: 15000 });
      for (const name of names) await page.getByLabel(`Select ${name}`).check();

      const confirm = page.getByRole("dialog", { name: "Delete documents" });
      await page.getByRole("button", { name: "Delete selected" }).click();
      await expect(confirm).toContainText("Are you sure you want to delete 2 document(s)?");
      await confirm.getByRole("button", { name: "Cancel" }).click();
      await expect(confirm).toBeHidden();
      await expect(rows).toHaveCount(2);
      expect(await docIdsNamed(api, prefix)).toHaveLength(2);

      await page.getByRole("button", { name: "Delete selected" }).click();
      await confirm.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(rows).toHaveCount(0, { timeout: 10000 });
      expect(await docIdsNamed(api, prefix)).toEqual([]);
    } finally {
      await deleteDocumentsNamed(api, prefix);
    }
  });

  test("upload zone accepts PDF, JPG, and PNG file types", async ({ authedPage: page }) => {
    await page.goto("/documents");
    const fileInput = page.locator("input[type='file']").first();
    await expect(fileInput).toBeAttached();
    const accept = await fileInput.getAttribute("accept");
    expect(accept).toContain(".pdf");
    expect(accept).toContain(".jpg");
    expect(accept).toContain(".png");
  });
});

test.describe("Documents — search", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(
      page.locator("table").or(page.getByText(/no documents found/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("search input is visible above the document table", async ({ authedPage: page }) => {
    const searchInput = page.getByPlaceholder(/search by file name/i);
    await expect(searchInput).toBeVisible();
  });

  test("typing in search filters documents by file name", async ({ authedPage: page, api }) => {
    // Get all documents from API to know what to search for
    const res = await api.get("/documents");
    test.skip(!res.ok(), "Documents API unavailable");
    const docs = await res.json() as Array<{ file_name: string; id: string }>;
    if (docs.length === 0) {
      test.skip(true, "No documents exist to search");
      return;
    }

    // Count initial rows
    const initialRows = await page.locator("tbody tr").count();
    test.skip(initialRows === 0, "No document rows visible in table — seed data to run this test");

    // Pick a document name to search for
    const targetDoc = docs[0];
    // Use part of the file name to search (first few characters)
    const searchTerm = targetDoc.file_name.slice(0, Math.min(5, targetDoc.file_name.length));

    const searchInput = page.getByPlaceholder(/search by file name/i);
    await searchInput.fill(searchTerm);

    // Wait a moment for the filter to apply
    await page.waitForTimeout(300);

    // The matching document should still be visible
    const filteredRows = await page.locator("tbody tr").count();
    // Filtered results should be <= initial rows (unless search matched everything)
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
    // At least one row should match (the doc we searched for)
    expect(filteredRows).toBeGreaterThan(0);
  });

  test("clearing search shows all documents again", async ({ authedPage: page, api }) => {
    const res = await api.get("/documents");
    test.skip(!res.ok(), "Documents API unavailable");
    const docs = await res.json() as Array<{ file_name: string }>;
    if (docs.length < 2) {
      test.skip(true, "Need at least 2 documents to test clear");
      return;
    }

    // Count initial visible rows
    const initialRows = await page.locator("tbody tr").count();
    test.skip(initialRows < 2, "Fewer than 2 document rows visible — need at least 2 to test search clear");

    // Type a very specific search to reduce results
    const searchInput = page.getByPlaceholder(/search by file name/i);
    const searchTerm = docs[0].file_name;
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(300);

    const filteredRows = await page.locator("tbody tr").count();

    // Now clear the search
    await searchInput.clear();
    await page.waitForTimeout(300);

    // All documents should be visible again
    const restoredRows = await page.locator("tbody tr").count();
    expect(restoredRows).toBeGreaterThanOrEqual(filteredRows);
    expect(restoredRows).toBe(initialRows);
  });
});

test.describe("Documents — viewer on row click", () => {
  let fileName = "";
  let docId = "";

  test.beforeEach(async ({ authedPage: page, api }, testInfo) => {
    fileName = `e2e-doc-viewer-${Date.now()}-${testInfo.workerIndex}.pdf`;
    docId = await seedDocument(api, fileName);

    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: fileName })).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async ({ api }) => {
    await deleteDocumentsNamed(api, fileName);
  });

  test("clicking a document row opens the viewer panel", async ({ authedPage: page }) => {
    await page.locator("tbody tr", { hasText: fileName }).click();

    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });
  });

  test("closing the viewer returns to the document list", async ({ authedPage: page }) => {
    await page.locator("tbody tr", { hasText: fileName }).click();
    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Close viewer").click();

    await expect(page.getByText("Source document")).toHaveCount(0);
    await expect(page.locator("tbody tr", { hasText: fileName })).toBeVisible();
  });

  test("viewer actually renders the source document — iframe src is a blob URL and download response is 200 with content", async ({ authedPage: page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const download = page.waitForResponse((resp) => resp.url().includes(`/documents/${docId}/download`));
    await page.locator("tbody tr", { hasText: fileName }).click();
    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });

    // 1. The download endpoint returned a non-empty PDF.
    const downloadResp = await download;
    expect(downloadResp.status()).toBe(200);
    expect(downloadResp.headers()["content-type"], "PDF download must advertise application/pdf").toContain("pdf");
    expect((await downloadResp.body()).length, "download body must be non-empty").toBeGreaterThan(0);

    // 2. The viewer rendered an iframe whose src is a blob: URL pointing at the fetched bytes.
    const iframe = page.locator('iframe[title="Source document"]');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    await expect(iframe).toHaveAttribute("src", /^blob:/);

    // 3. The error message UI must NOT be rendered.
    await expect(page.locator("p.text-destructive")).toHaveCount(0);

    // 4. No browser console errors fired during the load.
    expect(
      consoleErrors,
      `unexpected browser console errors during viewer load: ${consoleErrors.join(" | ")}`
    ).toEqual([]);
  });
});

test.describe("Documents — Type column", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(
      page.locator("table").or(page.getByText(/no documents found/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("Type column header is present in the documents table", async ({ authedPage: page }) => {
    // The column header "Type" must be rendered — this is the document_type column
    const typeHeader = page.locator("thead th").filter({ hasText: /^Type$/ });
    await expect(typeHeader).toBeVisible({ timeout: 10000 });
  });

  test("Type column cells show human-readable labels not raw file formats", async ({ authedPage: page, api }) => {
    // If no documents exist there is nothing to check
    const res = await api.get("/documents");
    test.skip(!res.ok(), "Documents API unavailable");
    const docs = await res.json() as Array<{ id: string; document_type: string | null }>;
    const withType = docs.filter((d) => d.document_type);
    if (withType.length === 0) {
      test.skip(true, "No documents with a document_type to verify");
      return;
    }

    // Gather all text in the Type column cells
    // Columns order: select, status, file_name, document_type, source, created_at, actions
    // The Type column is the 4th column (index 3, 1-based: nth(4))
    const typeCells = page.locator("tbody tr td:nth-child(4)");
    const cellTexts = await typeCells.allTextContents();

    // None of the type cells should show raw file extensions
    const rawFormats = ["pdf", "image", "docx", "xlsx", "csv", "jpg", "png"];
    for (const text of cellTexts) {
      const lower = text.trim().toLowerCase();
      // Skip cells that are empty or dash (document_type is null)
      if (lower === "" || lower === "\u2014") continue;
      for (const fmt of rawFormats) {
        expect(lower).not.toBe(fmt);
      }
    }

    // At least one cell should contain a known label (Invoice, Statement, W-2, etc.)
    const knownLabels = [
      "invoice", "statement", "lease", "insurance", "tax form", "contract",
      "receipt", "year-end statement", "w-2", "1099", "1098", "k-1", "other",
    ];
    const hasKnownLabel = cellTexts.some((text) =>
      knownLabels.some((label) => text.toLowerCase().includes(label))
    );
    expect(hasKnownLabel).toBe(true);
  });

  test("Type filter dropdown opens when clicking the filter icon on the Type column", async ({ authedPage: page }) => {
    // The ColumnFilter renders a button with aria-label="Filter document_type"
    const filterBtn = page.getByRole("button", { name: "Filter document_type" });
    await expect(filterBtn).toBeVisible({ timeout: 10000 });

    await filterBtn.click();

    // The dropdown should appear — it contains labeled checkboxes for each document type
    // Use a specific label text that must always be in the type list (e.g. "Invoice")
    await expect(
      page.locator("button[aria-label='Filter document_type'] ~ div label").first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("selecting a Type filter reduces or maintains the visible row count", async ({ authedPage: page, api }) => {
    // Need at least one document with a known type to filter by
    const res = await api.get("/documents");
    test.skip(!res.ok(), "Documents API unavailable");
    const docs = await res.json() as Array<{ document_type: string | null }>;
    const withType = docs.filter((d) => d.document_type);
    if (withType.length === 0) {
      test.skip(true, "No documents with a document_type to filter by");
      return;
    }

    const initialRowCount = await page.locator("tbody tr").count();
    test.skip(initialRowCount === 0, "No document rows visible in table — seed data to run this test");

    // Open the Type filter dropdown
    const filterBtn = page.getByRole("button", { name: "Filter document_type" });
    await filterBtn.click();

    // The dropdown checkbox labels are siblings of the trigger button inside the relative wrapper
    const firstLabel = page.locator("button[aria-label='Filter document_type'] ~ div label").first();
    await expect(firstLabel).toBeVisible({ timeout: 5000 });
    await firstLabel.click();

    // Click elsewhere to close the dropdown
    await page.locator("h1, [role='heading']").first().click();
    await page.waitForTimeout(300);

    const filteredRowCount = await page.locator("tbody tr").count();
    // After selecting one type filter, row count should not exceed the original
    expect(filteredRowCount).toBeLessThanOrEqual(initialRowCount);
  });

  test("clearing the Type filter restores all document rows", async ({ authedPage: page, api }) => {
    const res = await api.get("/documents");
    test.skip(!res.ok(), "Documents API unavailable");
    const docs = await res.json() as Array<{ document_type: string | null }>;
    if (docs.filter((d) => d.document_type).length === 0) {
      test.skip(true, "No documents with a document_type to filter");
      return;
    }

    const initialRowCount = await page.locator("tbody tr").count();
    test.skip(initialRowCount === 0, "No document rows visible in table — seed data to run this test");

    // Apply a filter via the first option in the dropdown
    const filterBtn = page.getByRole("button", { name: "Filter document_type" });
    await filterBtn.click();
    const firstLabel = page.locator("button[aria-label='Filter document_type'] ~ div label").first();
    await expect(firstLabel).toBeVisible({ timeout: 5000 });
    await firstLabel.click();

    // Close dropdown by clicking heading
    await page.locator("h1, [role='heading']").first().click();
    await page.waitForTimeout(300);

    // Reopen and click "Clear filter"
    await filterBtn.click();
    const clearBtn = page.locator("button[aria-label='Filter document_type'] ~ div button").filter({ hasText: /clear filter/i });
    if (await clearBtn.isVisible({ timeout: 3000 })) {
      await clearBtn.click();
    }
    await page.waitForTimeout(300);

    const restoredRowCount = await page.locator("tbody tr").count();
    // After clearing, row count should be restored to at least what it was before filtering
    expect(restoredRowCount).toBeGreaterThanOrEqual(initialRowCount);
  });
});
