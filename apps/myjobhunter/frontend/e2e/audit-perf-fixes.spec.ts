/**
 * E2E: Audit 2026-05-02 — performance + UX fixes
 *
 * Covers three audit fixes:
 *
 * 1. CompanyDetail server-side ?company_id= filter:
 *    - Create 2 companies + 1 application each
 *    - Navigate to company A detail → only company A's application appears
 *
 * 2. RTK Query cache invalidation after logApplicationEvent:
 *    - Log an event from the ApplicationDetail page
 *    - Navigate back to /applications
 *    - Status badge updates without manual refresh (no 60 s stale window)
 *
 * NOTE: These tests require the backend running on BACKEND_URL.
 * The covering index change (Fix 1) cannot be asserted in E2E — it is a
 * DB-level optimization with no user-visible behavior change. Its correctness
 * is verified via EXPLAIN ANALYZE (captured in the migration comment and PR
 * description).
 */
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";

// ---------------------------------------------------------------------------
// API helpers (mirrors applications-status.spec.ts)
// ---------------------------------------------------------------------------

async function getToken(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
    form: { username: email, password },
  });
  if (!res.ok()) {
    throw new Error(`Login failed: ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function createCompanyViaApi(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await request.post(`${BACKEND_URL}/api/companies`, {
    data: {
      name,
      primary_domain: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.example.com`,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create company: ${res.status()} — ${await res.text()}`);
  }
  const body = await res.json();
  return { id: body.id, name: body.name };
}

async function createApplicationViaApi(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  companyId: string,
  roleTitle: string,
): Promise<string> {
  const res = await request.post(`${BACKEND_URL}/api/applications`, {
    data: {
      company_id: companyId,
      role_title: roleTitle,
      remote_type: "remote",
      source: "linkedin",
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to create application: ${res.status()} — ${await res.text()}`);
  }
  return (await res.json()).id;
}

// ---------------------------------------------------------------------------
// Fix 3 — CompanyDetail server-side ?company_id= filter
// ---------------------------------------------------------------------------

test.describe("CompanyDetail — server-side company_id filter (audit fix 2026-05-02)", () => {
  test("shows only applications for the current company, not all user applications", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await getToken(request, user.email, user.password);

      // Create 2 companies with 1 application each.
      const companyA = await createCompanyViaApi(request, token, "Company Alpha Filter");
      const companyB = await createCompanyViaApi(request, token, "Company Beta Filter");

      const _appIdA = await createApplicationViaApi(
        request, token, companyA.id, "Alpha Engineer",
      );
      const _appIdB = await createApplicationViaApi(
        request, token, companyB.id, "Beta Engineer",
      );

      await loginViaUI(page, user, request);

      // Navigate to company A detail via the companies list.
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      const companyARow = page
        .getByRole("button")
        .filter({ hasText: "Company Alpha Filter" })
        .first();
      await expect(companyARow).toBeVisible({ timeout: 8_000 });
      await companyARow.click();
      await page.waitForURL("**/companies/**");

      // Wait for the company name heading.
      await expect(
        page.getByRole("heading", { name: "Company Alpha Filter", exact: true }),
      ).toBeVisible({ timeout: 8_000 });

      // Company A's application is visible.
      await expect(page.getByText("Alpha Engineer")).toBeVisible();

      // Company B's application is NOT visible — server filtered it out.
      await expect(page.getByText("Beta Engineer")).not.toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("shows empty state for a company with no applications", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await getToken(request, user.email, user.password);

      // Create a company but no applications.
      await createCompanyViaApi(request, token, "Empty Company Filter");

      await loginViaUI(page, user, request);

      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");

      const row = page
        .getByRole("button")
        .filter({ hasText: "Empty Company Filter" })
        .first();
      await expect(row).toBeVisible({ timeout: 8_000 });
      await row.click();
      await page.waitForURL("**/companies/**");

      await expect(
        page.getByRole("heading", { name: "Empty Company Filter", exact: true }),
      ).toBeVisible({ timeout: 8_000 });

      // Applications section shows empty state copy.
      await expect(
        page.getByText("No applications at this company yet."),
      ).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — RTK Query cache invalidation after logApplicationEvent
// ---------------------------------------------------------------------------

test.describe("Applications list — status badge updates after logging event (audit fix 2026-05-02)", () => {
  test("status badge on /applications reflects a newly logged event without manual refresh", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await getToken(request, user.email, user.password);

      // Create a company + application with no events.
      const company = await createCompanyViaApi(request, token, "Cache Test Corp");
      await createApplicationViaApi(request, token, company.id, "Cache Test Engineer");

      await loginViaUI(page, user, request);

      // Navigate to /applications and confirm the application is there with no status.
      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");

      await expect(page.getByText("Cache Test Engineer")).toBeVisible({ timeout: 8_000 });

      // Click into the application detail row.
      const appRow = page
        .getByRole("button")
        .filter({ hasText: "Cache Test Engineer" })
        .first();
      await appRow.click();
      await page.waitForURL("**/applications/**");

      // Log an event via the Log Event dialog.
      await page.getByRole("button", { name: /log event/i }).click();

      // Wait for the dialog to open.
      await expect(
        page.getByRole("dialog"),
      ).toBeVisible({ timeout: 5_000 });

      // Select "Applied" from the event type dropdown.
      await page.getByRole("combobox", { name: /event type/i }).selectOption("applied");

      // Submit.
      await page.getByRole("button", { name: /log event/i }).last().click();

      // Navigate back to /applications.
      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");

      // Status badge should now show "Applied" — no manual refresh needed.
      // This verifies that logApplicationEvent invalidates the Applications list cache.
      await expect(page.getByText("Applied")).toBeVisible({ timeout: 8_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
