import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { deleteDocumentsNamed, docIdsNamed, seedDocument, seedTypedDocument, uniquePdf } from "./fixtures/documents";

// Only this file uploads documents, and the upload zone takes one upload at a
// time across the workspace, so its tests run in order rather than in parallel.
test.describe.configure({ mode: "default" });

// The list is shared with other specs and paged, so narrow it to this test's files.
async function openDocuments(page: Page, search: string): Promise<void> {
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.locator("table").or(page.getByText(/no documents found/i)).first()).toBeVisible({ timeout: 15000 });
  await page.getByPlaceholder("Search by file name...").fill(search);
}

function rowNamed(page: Page, name: string): Locator {
  return page.locator("tbody tr", { hasText: name });
}

test.describe("Documents — upload, verify, delete", () => {
  test.describe.configure({ timeout: 90_000 });
  function prefixFor(testInfo: TestInfo, label: string): string {
    return `e2e-doc-${label}-${Date.now()}-${testInfo.workerIndex}`;
  }

  test("uploading a PDF adds it to the list", async ({ authedPage: page, api }, testInfo) => {
    const name = `${prefixFor(testInfo, "upload")}.pdf`;
    try {
      await openDocuments(page, name);

      await page.locator("input[type='file']").first().setInputFiles(uniquePdf(name));

      // The list leaves out documents still being read, so the row shows once extraction ends.
      await expect(rowNamed(page, name)).toBeVisible({ timeout: 60000 });
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
      const row = rowNamed(page, name);
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
      await expect(rowNamed(page, prefix)).toHaveCount(2, { timeout: 15000 });

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
      const rows = rowNamed(page, prefix);
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
  let prefix = "";
  let first = "";
  let second = "";

  test.beforeEach(async ({ authedPage: page, api }, testInfo) => {
    prefix = `e2e-doc-search-${Date.now()}-${testInfo.workerIndex}`;
    first = `${prefix}-alpha.pdf`;
    second = `${prefix}-beta.pdf`;
    await seedTypedDocument(api, first, "invoice");
    await seedTypedDocument(api, second, "receipt");
    await openDocuments(page, prefix);
    await expect(rowNamed(page, first)).toHaveCount(1);
    await expect(rowNamed(page, second)).toHaveCount(1);
  });

  test.afterEach(async ({ api }) => {
    await deleteDocumentsNamed(api, prefix);
  });

  test("typing in search shows only documents whose file name matches", async ({ authedPage: page }) => {
    const search = page.getByPlaceholder("Search by file name...");
    await expect(search).toBeVisible();

    await search.fill(first);

    await expect(rowNamed(page, first)).toHaveCount(1);
    await expect(rowNamed(page, second)).toHaveCount(0);
  });

  test("clearing search shows all documents again", async ({ authedPage: page }) => {
    const search = page.getByPlaceholder("Search by file name...");
    await search.fill(first);
    await expect(rowNamed(page, second)).toHaveCount(0);

    await search.clear();

    await expect(rowNamed(page, first)).toHaveCount(1);
    await expect(rowNamed(page, second)).toHaveCount(1);
    await expect(search).toHaveValue("");
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
    await expect(rowNamed(page, fileName)).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async ({ api }) => {
    await deleteDocumentsNamed(api, fileName);
  });

  test("clicking a document row opens the viewer panel", async ({ authedPage: page }) => {
    await rowNamed(page, fileName).click();

    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });
  });

  test("closing the viewer returns to the document list", async ({ authedPage: page }) => {
    await rowNamed(page, fileName).click();
    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Close viewer").click();

    await expect(page.getByText("Source document")).toHaveCount(0);
    await expect(rowNamed(page, fileName)).toBeVisible();
  });

  test("viewer actually renders the source document — iframe src is a blob URL and download response is 200 with content", async ({ authedPage: page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const download = page.waitForResponse((resp) => resp.url().includes(`/documents/${docId}/download`));
    await rowNamed(page, fileName).click();
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
  let prefix = "";
  let invoice = "";
  let w2 = "";

  test.beforeEach(async ({ authedPage: page, api }, testInfo) => {
    prefix = `e2e-doc-type-${Date.now()}-${testInfo.workerIndex}`;
    invoice = `${prefix}-a.pdf`;
    w2 = `${prefix}-b.pdf`;
    await seedTypedDocument(api, invoice, "invoice");
    await seedTypedDocument(api, w2, "w2");
    await openDocuments(page, prefix);
    await expect(rowNamed(page, invoice)).toHaveCount(1);
    await expect(rowNamed(page, w2)).toHaveCount(1);
  });

  test.afterEach(async ({ api }) => {
    await deleteDocumentsNamed(api, prefix);
  });

  test("Type cells show the document type's label, not its raw value", async ({ authedPage: page }) => {
    const headers = (await page.locator("thead th").allTextContents()).map((h) => h.trim());
    const typeColumn = headers.indexOf("Type");
    expect(typeColumn, `headers: ${headers.join(" | ")}`).toBeGreaterThanOrEqual(0);

    await expect(rowNamed(page, invoice).locator("td").nth(typeColumn)).toHaveText("Invoice");
    await expect(rowNamed(page, w2).locator("td").nth(typeColumn)).toHaveText("W-2");
  });

  test("filtering by a type shows only documents of that type", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: "Filter document_type" }).click();
    await page.getByRole("checkbox", { name: "W-2", exact: true }).check();

    await expect(rowNamed(page, w2)).toHaveCount(1);
    await expect(rowNamed(page, invoice)).toHaveCount(0);
  });

  test("clearing the Type filter shows every type again", async ({ authedPage: page }) => {
    const filter = page.getByRole("button", { name: "Filter document_type" });
    await filter.click();
    await page.getByRole("checkbox", { name: "W-2", exact: true }).check();
    await expect(rowNamed(page, invoice)).toHaveCount(0);

    await page.getByRole("button", { name: "Clear filter" }).click();

    await expect(rowNamed(page, invoice)).toHaveCount(1);
    await expect(rowNamed(page, w2)).toHaveCount(1);
    // The filter button shows a count badge only while a filter is applied.
    await expect(filter.locator("span")).toHaveCount(0);
  });
});
