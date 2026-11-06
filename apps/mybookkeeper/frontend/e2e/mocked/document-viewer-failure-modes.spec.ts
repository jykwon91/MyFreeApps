/**
 * Layout E2E for DocumentViewer's failure-mode UX. Mirrors the user-visible
 * scenarios that produced the 2026-04-30 "i still can't see the source documents"
 * report. Mocks the API surface so the test runs without a backend.
 */
import { test, expect } from "@playwright/test";

function plantValidJwtAndOrgInLocalStorage(page: import("@playwright/test").Page): Promise<void> {
  return page.addInitScript(() => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
    window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
    window.localStorage.setItem("v1_activeOrgId", "00000000-0000-0000-0000-000000000010");
  });
}

async function stubAuthAndOrg(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/users/me", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        name: "Test User",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: "owner",
      }),
    });
  });
  await page.route("**/api/organizations", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: "00000000-0000-0000-0000-000000000010", name: "Test Workspace", role: "owner" },
      ]),
    });
  });
  await page.route("**/api/version", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "test" }) });
  });
  await page.route("**/api/tax-profile", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 }),
    });
  });
}

const DOC_ID = "00000000-0000-0000-0000-000000000aaa";

async function stubDocumentList(page: import("@playwright/test").Page): Promise<void> {
  // The Documents page calls /api/documents (RTK Query) — return one PDF row.
  await page.route("**/api/documents*", (route, request) => {
    if (request.method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: DOC_ID,
            file_name: "empty-test.pdf",
            file_mime_type: "application/pdf",
            status: "completed",
            document_type: "Invoice",
            source: "manual",
            created_at: "2026-05-01T00:00:00Z",
            user_id: "00000000-0000-0000-0000-000000000001",
            organization_id: "00000000-0000-0000-0000-000000000010",
            invoice_id: null,
          },
        ]),
      });
      return;
    }
    route.continue();
  });
}

test.describe("DocumentViewer — failure modes surface to user", () => {
  test("zero-byte download response shows the empty-state message, not a blank iframe", async ({ page }) => {
    await plantValidJwtAndOrgInLocalStorage(page);
    await stubAuthAndOrg(page);
    await stubDocumentList(page);

    // Critical mock: the download endpoint returns 200 with an empty body.
    // This is the silent-failure mode the previous wrong fixes (#131/#134) did
    // not address — the iframe stayed blank with no error visible to the user.
    await page.route(`**/api/documents/${DOC_ID}/download`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Length": "0" },
        body: Buffer.alloc(0),
      });
    });

    await page.goto("/documents");

    // Wait for the table to render
    await expect(page.locator("table")).toBeVisible({ timeout: 15000 });
    const row = page.locator("tbody tr", { hasText: "empty-test.pdf" }).first();
    await expect(row).toBeVisible();
    await row.click();

    // Header should appear (existing tests stop here — but that's not enough)
    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });

    // BEHAVIORAL ASSERTION — empty state is rendered, NOT a blank iframe.
    await expect(page.getByTestId("document-empty")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("document-empty")).toContainText(/no content available/i);

    // The iframe must NOT render for an empty blob.
    await expect(page.locator('iframe[title="Source document"]')).toHaveCount(0);
  });

  test("successful PDF download shows iframe AND an 'Open in new tab' fallback link", async ({ page }) => {
    await plantValidJwtAndOrgInLocalStorage(page);
    await stubAuthAndOrg(page);
    await stubDocumentList(page);

    // Minimal valid PDF bytes (PDF header + EOF marker — enough for size > 0)
    const pdfBytes = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000054 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n98\n%%EOF\n",
      "utf-8"
    );

    await page.route(`**/api/documents/${DOC_ID}/download`, (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/pdf" },
        body: pdfBytes,
      });
    });

    await page.goto("/documents");
    await expect(page.locator("table")).toBeVisible({ timeout: 15000 });
    await page.locator("tbody tr", { hasText: "empty-test.pdf" }).first().click();

    await expect(page.getByText("Source document").first()).toBeVisible({ timeout: 10000 });

    // Iframe rendered with a blob: URL.
    const iframe = page.locator('iframe[title="Source document"]');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    const src = await iframe.getAttribute("src");
    expect(src?.startsWith("blob:"), `iframe src should be a blob URL, got ${src}`).toBe(true);

    // Open-in-new-tab fallback is visible and points at the same blob URL.
    const fallback = page.getByTestId("document-open-in-new-tab");
    await expect(fallback).toBeVisible();
    expect(await fallback.getAttribute("href")).toBe(src);
    expect(await fallback.getAttribute("target")).toBe("_blank");

    // No empty-state, no error.
    await expect(page.getByTestId("document-empty")).toHaveCount(0);
    await expect(page.getByTestId("document-error")).toHaveCount(0);
  });
});
