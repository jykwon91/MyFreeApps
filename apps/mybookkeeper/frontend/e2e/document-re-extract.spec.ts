/**
 * Behavioral E2E for the re-extract-on-failed-document flow shipped in
 * "fix(mbk): surface real extraction error + add re-extract button on failed docs".
 *
 * Mocks the API surface (the e2e/ layout-spec convention — CI runs these specs
 * without a backend via playwright.layout.config.ts). A real backend cannot be
 * driven to a `failed` document in CI: the upload-processor worker isn't running
 * and there is no API to force a `failed` status, so the failed row is mocked.
 *
 * The spec still drives the REAL user flow end to end: a failed document is
 * listed, the user clicks the "Re-extract this document" action, and we assert
 *   (a) the POST /documents/{id}/re-extract request actually fires,
 *   (b) the conversational success toast appears, and
 *   (c) the row leaves the failed state and reprocesses — the list query excludes
 *       `processing`/`extracting` docs, so the failed row drops out while the
 *       worker re-runs, then the document reappears in its reprocessed state.
 */
import { test, expect } from "@playwright/test";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ORG_ID = "00000000-0000-0000-0000-000000000010";
const DOC_ID = "00000000-0000-0000-0000-000000000bbb";
const FAILED_FILE = "unreadable-invoice.pdf";

function plantValidJwtAndOrgInLocalStorage(page: import("@playwright/test").Page): Promise<void> {
  return page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}

async function stubAuthAndOrg(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/users/me", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: USER_ID,
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
        {
          id: ORG_ID,
          name: "Test Workspace",
          org_role: "owner",
          is_demo: false,
          created_at: "2026-01-01T00:00:00Z",
        },
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

function documentRow(status: string, errorMessage: string | null): Record<string, unknown> {
  return {
    id: DOC_ID,
    file_name: FAILED_FILE,
    file_mime_type: "application/pdf",
    status,
    error_message: errorMessage,
    document_type: "Invoice",
    source: "manual",
    created_at: "2026-06-01T00:00:00Z",
    user_id: USER_ID,
    organization_id: ORG_ID,
    invoice_id: null,
    is_escrow_paid: false,
  };
}

test.describe("Documents — re-extract a failed document", () => {
  test("clicking Re-extract on a failed row fires the request and the document reprocesses", async ({ page }) => {
    await plantValidJwtAndOrgInLocalStorage(page);
    await stubAuthAndOrg(page);

    let reExtractMethod: string | null = null;
    let getCallsAfterReExtract = 0;

    // GET /documents list. Failed until the re-extract POST fires. After that the
    // doc is `processing` — which the list query (exclude_processing=true) filters
    // out, so the first refetch returns an empty list (row drops out). Subsequent
    // polls return the reprocessed `completed` document.
    await page.route("**/api/documents*", async (route, request) => {
      if (request.method() !== "GET") {
        await route.fallback();
        return;
      }
      let body: Array<Record<string, unknown>>;
      if (reExtractMethod === null) {
        body = [documentRow("failed", "I couldn't read this document — the file looks corrupted.")];
      } else {
        getCallsAfterReExtract += 1;
        body = getCallsAfterReExtract <= 1 ? [] : [documentRow("completed", null)];
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    // POST /documents/{id}/re-extract. Registered AFTER the list route so it wins
    // for this specific URL. Returns the real 202 { status: "processing" } shape.
    await page.route(`**/api/documents/${DOC_ID}/re-extract`, async (route, request) => {
      reExtractMethod = request.method();
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ status: "processing" }),
      });
    });

    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 15000 });

    // The failed document is listed with its Failed badge...
    const failedRow = page.locator("tbody tr", { hasText: FAILED_FILE });
    await expect(failedRow).toBeVisible({ timeout: 15000 });
    await expect(failedRow.getByText("Failed", { exact: true })).toBeVisible();

    // ...and the conversational failed banner prompts a retry.
    await expect(page.getByText(`I had trouble with ${FAILED_FILE}`)).toBeVisible();

    // The re-extract action is present on the failed row.
    const reExtractBtn = page.getByRole("button", { name: "Re-extract this document" });
    await expect(reExtractBtn).toBeVisible();

    // Act: click Re-extract.
    await reExtractBtn.click();

    // (a) The POST /re-extract request actually fired.
    await expect
      .poll(() => reExtractMethod, { timeout: 10000, message: "re-extract request was never sent" })
      .toBe("POST");

    // (b) The conversational success toast confirms the action.
    await expect(page.getByText("take another look at this one")).toBeVisible({ timeout: 10000 });

    // (c) The document leaves the failed state — the re-extract action and the
    // failed banner disappear while it reprocesses...
    await expect(page.getByRole("button", { name: "Re-extract this document" })).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText(`I had trouble with ${FAILED_FILE}`)).toHaveCount(0);

    // ...then the document reappears in its reprocessed (completed) state.
    await expect(
      page.locator("tbody tr", { hasText: FAILED_FILE }).getByTitle("Completed"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("on a mobile viewport the re-extract action is reachable on the failed document card", async ({ page }) => {
    // The desktop table is hidden below the md breakpoint; the mobile card view
    // renders instead. Row actions used to be desktop-only, so a failed document
    // could not be retried on a phone at all. getByRole excludes the hidden
    // desktop table (includeHidden defaults to false), so it resolves only the
    // visible mobile-card action.
    await page.setViewportSize({ width: 390, height: 844 });
    await plantValidJwtAndOrgInLocalStorage(page);
    await stubAuthAndOrg(page);

    let reExtractMethod: string | null = null;

    await page.route("**/api/documents*", async (route, request) => {
      if (request.method() !== "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([documentRow("failed", "I couldn't read this document — the file looks corrupted.")]),
      });
    });
    await page.route(`**/api/documents/${DOC_ID}/re-extract`, async (route, request) => {
      reExtractMethod = request.method();
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "processing" }) });
    });

    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 15000 });

    // The failed document's card exposes reachable row actions. getByRole
    // resolves only the visible mobile-card buttons (the hidden desktop table's
    // duplicates are excluded), so a single match proves the mobile-card fix.
    const reExtractBtn = page.getByRole("button", { name: "Re-extract this document" });
    await expect(reExtractBtn).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Delete document" })).toBeVisible();

    // Clicking it fires the real re-extract request and confirms with a toast.
    await reExtractBtn.click();
    await expect
      .poll(() => reExtractMethod, { timeout: 10000, message: "re-extract request was never sent from mobile" })
      .toBe("POST");
    await expect(page.getByText("take another look at this one")).toBeVisible({ timeout: 10000 });
  });
});
