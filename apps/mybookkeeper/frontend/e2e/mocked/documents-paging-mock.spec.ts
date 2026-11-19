/**
 * No-backend E2E for the Documents list reaching past its first page.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies, on /documents:
 *   - The list is asked of the server a page at a time (limit and offset); Load more
 *     brings in the documents past the first page, and the count reads from the
 *     server's total rather than from what has loaded.
 *   - "Select all" ticks every matching document, loaded or not, and Delete selected
 *     sends every one of them.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubDocumentPages, type MockDocumentRequests } from "./fixtures/mockDocuments";

const TOTAL = 75;
const PAGE_SIZE = 50;

const ROWS = Array.from({ length: TOTAL }, (_, i) => ({
  id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  property_id: null,
  file_name: `doc-${i + 1}.pdf`,
  file_type: "pdf",
  file_mime_type: "application/pdf",
  document_type: "invoice",
  source: "upload",
  status: "completed",
  error_message: null,
  is_escrow_paid: false,
  created_at: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString(),
  updated_at: "2026-01-01T00:00:00Z",
}));

interface MockedDocuments extends MockDocumentRequests {
  bulkDeletes: string[][];
}

async function openDocuments(page: Page): Promise<MockedDocuments> {
  await plantAuth(page);
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubWorkspaceShell(page, "owner");
  const requests = await stubDocumentPages(page, ROWS);
  const bulkDeletes: string[][] = [];
  await page.route("**/api/documents/bulk-delete", (route) => {
    const { ids } = route.request().postDataJSON() as { ids: string[] };
    bulkDeletes.push(ids);
    return route.fulfill(json({ deleted: ids, skipped: [] }));
  });
  await page.goto("/documents");
  return { ...requests, bulkDeletes };
}

const table = (page: Page) => page.getByRole("table");
const mainListRequests = (pages: URLSearchParams[]) => pages.filter((query) => !query.has("statuses"));

test.describe("Documents list paging", () => {
  test("Load more brings in documents past the first page, counted from the server's total", async ({ page }) => {
    const { pages } = await openDocuments(page);
    await expect(page.getByTestId("documents-shown-count")).toHaveText(`${PAGE_SIZE} of ${TOTAL} documents`);
    await expect(table(page).getByText(`doc-${PAGE_SIZE}.pdf`, { exact: true })).toBeVisible();
    await expect(table(page).getByText(`doc-${PAGE_SIZE + 1}.pdf`, { exact: true })).toHaveCount(0);

    await page.getByTestId("load-more-button").click();

    await expect(table(page).getByText(`doc-${TOTAL}.pdf`, { exact: true })).toBeVisible();
    await expect(page.getByTestId("documents-shown-count")).toHaveText(`${TOTAL} documents`);
    await expect(page.getByTestId("load-more-button")).toHaveCount(0);
    const last = mainListRequests(pages).at(-1);
    expect(last?.get("limit")).toBe(String(PAGE_SIZE));
    expect(last?.get("offset")).toBe(String(PAGE_SIZE));
  });

  test("Select all reaches documents not loaded yet, and Delete selected sends every one", async ({ page }) => {
    const { selections, bulkDeletes } = await openDocuments(page);
    await expect(page.getByTestId("documents-shown-count")).toHaveText(`${PAGE_SIZE} of ${TOTAL} documents`);

    await page.getByRole("checkbox", { name: "Select all documents" }).check();
    await expect(page.getByText(`${TOTAL} selected`)).toBeVisible();
    expect(selections.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Delete selected" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect.poll(() => bulkDeletes.flat().length).toBe(TOTAL);
    expect(bulkDeletes.flat()).toContain(ROWS[TOTAL - 1].id);
  });
});
