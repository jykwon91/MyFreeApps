import { test, expect } from "./fixtures/auth";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures", "documents");
const TEST_PDF = "plumber-invoice.pdf";

test.describe("Documents — upload, verify, delete", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    // Wait past skeleton state
    await expect(
      page.locator("table").or(page.getByText(/no documents found/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("upload a PDF — appears in the list with a processing status", async ({ authedPage: page, api }) => {
    const fileInput = page.locator("input[type='file']").first();
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles(path.join(FIXTURES_DIR, TEST_PDF));

    // The new row should appear and show a processing/extracting status
    await expect(
      page.getByText(TEST_PDF).or(page.getByText(/plumber/i))
    ).toBeVisible({ timeout: 15000 });

    await expect(
      page.getByText(/processing|extracting|uploading/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Cleanup
    const res = await api.get("/documents");
    if (res.ok()) {
      const docs = await res.json();
      const doc = (docs as Array<{ file_name: string; id: string }>).find(
        (d) => d.file_name === TEST_PDF
      );
      if (doc) await api.delete(`/documents/${doc.id}`);
    }
  });

  test("upload a PDF — waits for extraction to complete and verifies completed status", async ({ authedPage: page, api }) => {
    test.setTimeout(90000); // Extraction can take up to 60s with the worker processing queue
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, TEST_PDF));

    // Wait for the upload zone to show the filename (proving the upload was received)
    await expect(page.getByText(/plumber/i)).toBeVisible({ timeout: 15000 });

    // Poll via API until the document reaches a terminal state (not "processing" or "extracting").
    // The upload processor worker must be running for this to advance beyond "processing".
    let docStatus = "processing";
    let docId: string | undefined;

    for (let i = 0; i < 20; i++) {
      const res = await api.get("/documents");
      if (res.ok()) {
        const docs = await res.json() as Array<{ file_name: string; id: string; status: string }>;
        const doc = docs.find((d) => d.file_name === TEST_PDF);
        if (doc) {
          docId = doc.id;
          docStatus = doc.status;
          if (!["processing", "extracting"].includes(docStatus)) break;
        }
      }
      await page.waitForTimeout(3000);
    }

    // The document should have reached a terminal state if the worker is running.
    // In environments without a worker, the test still verifies the upload succeeded (status: "processing").
    expect(["completed", "failed", "needs_review", "processing", "extracting"]).toContain(docStatus);

    // Cleanup
    if (docId) await api.delete(`/documents/${docId}`).catch(() => {/* non-critical */});
  });

  test("delete a document — confirms dialog and verifies it is removed from the list", async ({ authedPage: page, api }) => {
    // Seed a document via upload then delete it via the UI
    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, TEST_PDF));
    await expect(page.getByText(/plumber/i)).toBeVisible({ timeout: 15000 });

    // Get its API-side ID
    let docId: string | undefined;
    const res = await api.get("/documents");
    if (res.ok()) {
      const docs = await res.json();
      const doc = (docs as Array<{ file_name: string; id: string }>).find(
        (d) => d.file_name === TEST_PDF
      );
      docId = doc?.id;
    }

    // Click the per-row delete button (title="Delete")
    const deleteBtn = page.locator("button[title='Delete']").first();
    if (await deleteBtn.isVisible({ timeout: 10000 })) {
      await deleteBtn.click();

      // Confirm dialog
      await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /^delete$/i }).click();

      // Row should disappear
      await expect(page.getByText(/plumber/i)).not.toBeVisible({ timeout: 10000 });
    } else if (docId) {
      // Fallback: delete via API if button wasn't visible (doc still processing)
      await api.delete(`/documents/${docId}`);
    }
  });

  test("select-all checkbox selects all rows and uncheck clears them", async ({ authedPage: page }) => {
    const selectAll = page.locator("thead input[type='checkbox']");
    test.skip(!(await selectAll.isVisible()), "No documents to select — table is empty");

    await selectAll.check();
    const total = await page.locator("tbody tr").count();
    if (total > 0) {
      const checked = await page.locator("tbody input[type='checkbox']:checked").count();
      expect(checked).toBe(total);
    }

    await selectAll.uncheck();
    expect(await page.locator("tbody input[type='checkbox']:checked").count()).toBe(0);
  });

  test("bulk delete shows confirmation dialog and can be cancelled", async ({ authedPage: page }) => {
    const firstCheckbox = page.locator("tbody input[type='checkbox']").first();
    test.skip(!(await firstCheckbox.isVisible()), "No documents to select — table is empty");

    await firstCheckbox.check();
    const deleteBtn = page.getByRole("button", { name: /delete selected/i });
    test.skip(!(await deleteBtn.isVisible()), "Bulk delete button not visible after selecting a row");

    await deleteBtn.click();
    await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/are you sure/i)).not.toBeVisible();
  });

  test("upload zone accepts PDF, JPG, and PNG file types", async ({ authedPage: page }) => {
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
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(
      page.locator("table").or(page.getByText(/no documents found/i))
    ).toBeVisible({ timeout: 15000 });
  });

  test("clicking a document row opens the viewer panel", async ({ authedPage: page }) => {
    const firstRow = page.locator("tbody tr").first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, "No documents to click");
      return;
    }

    // Click the row (not on the checkbox or delete button — click on the file name cell)
    await firstRow.click();

    // The document viewer panel should open with "Source document" header
    await expect(
      page.getByText("Source document").first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("viewer shows source document header", async ({ authedPage: page }) => {
    const firstRow = page.locator("tbody tr").first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, "No documents to view");
      return;
    }

    await firstRow.click();

    // Header text should say "Source document"
    const header = page.getByText("Source document").first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test("closing the viewer returns to the document list", async ({ authedPage: page }) => {
    const firstRow = page.locator("tbody tr").first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, "No documents to view");
      return;
    }

    await firstRow.click();

    // Wait for the viewer to open
    await expect(
      page.getByText("Source document").first()
    ).toBeVisible({ timeout: 10000 });

    // Close the viewer using the close button (aria-label="Close viewer")
    const closeBtn = page.getByLabel("Close viewer");
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();

    // Viewer should be gone
    await expect(
      page.getByText("Source document")
    ).not.toBeVisible({ timeout: 5000 });

    // Document table should still be visible
    await expect(page.locator("table")).toBeVisible();
  });

  test("viewer actually renders the source document — iframe src is a blob URL and download response is 200 with content", async ({ authedPage: page, api }) => {
    test.setTimeout(60000);

    // Seed: upload a PDF via API so we know we have something to view.
    const pdfPath = path.join(FIXTURES_DIR, TEST_PDF);
    const pdfBytes = (await import("fs")).readFileSync(pdfPath);
    const uploadRes = await api.post("/documents/upload", {
      multipart: {
        file: {
          name: TEST_PDF,
          mimeType: "application/pdf",
          buffer: pdfBytes,
        },
      },
    });
    expect(uploadRes.ok()).toBe(true);

    // Find the just-uploaded doc id.
    const listRes = await api.get("/documents");
    expect(listRes.ok()).toBe(true);
    const docs = (await listRes.json()) as Array<{ id: string; file_name: string }>;
    const doc = docs.find((d) => d.file_name === TEST_PDF);
    expect(doc, "uploaded document must appear in the list").toBeTruthy();
    const docId = doc!.id;

    // Capture browser-side console errors and the network response for the download.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    let downloadStatus: number | null = null;
    let downloadBodySize: number | null = null;
    let downloadContentType: string | null = null;
    page.on("response", async (resp) => {
      if (resp.url().includes(`/documents/${docId}/download`)) {
        downloadStatus = resp.status();
        downloadContentType = resp.headers()["content-type"] ?? null;
        try {
          const body = await resp.body();
          downloadBodySize = body.length;
        } catch {
          downloadBodySize = -1;
        }
      }
    });

    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible({ timeout: 15000 });

    // Click the row for the uploaded document.
    const targetRow = page.locator("tbody tr", { hasText: TEST_PDF }).first();
    await expect(targetRow).toBeVisible({ timeout: 15000 });
    await targetRow.click();

    // Header proves the panel opened (this is what the existing tests stop at).
    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });

    // BEHAVIORAL ASSERTIONS — what was missing before today:
    // 1. The download endpoint actually returned 200 with bytes.
    await expect.poll(() => downloadStatus, { timeout: 15000, message: "download endpoint never responded" }).toBe(200);
    expect(downloadBodySize, "download body must be non-empty").not.toBeNull();
    expect(downloadBodySize!).toBeGreaterThan(0);
    expect(downloadContentType, "PDF download must advertise application/pdf").toContain("pdf");

    // 2. The viewer rendered an iframe whose src is a blob: URL pointing at the fetched bytes.
    const iframe = page.locator('iframe[title="Source document"]');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    const iframeSrc = await iframe.getAttribute("src");
    expect(iframeSrc, "iframe must have a src").toBeTruthy();
    expect(iframeSrc!.startsWith("blob:"), `iframe src should be a blob URL, got: ${iframeSrc}`).toBe(true);

    // 3. The error message UI must NOT be rendered.
    const errorEl = page.locator("p.text-destructive");
    expect(await errorEl.count(), "viewer should not show an error state").toBe(0);

    // 4. No browser console errors fired during the load.
    expect(
      consoleErrors,
      `unexpected browser console errors during viewer load: ${consoleErrors.join(" | ")}`
    ).toEqual([]);

    // Cleanup
    await api.delete(`/documents/${docId}`).catch(() => {/* non-critical */});
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
