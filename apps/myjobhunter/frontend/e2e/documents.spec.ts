import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

/**
 * E2E tests for the Documents domain (Phase 2).
 *
 * Covers:
 *   1. Documents page is accessible via sidebar nav
 *   2. Empty state shown when no documents exist
 *   3. Create a text-body document via the upload dialog
 *   4. Created document appears in the list
 *   5. Delete a document — it disappears from the list
 *   6. Documents section appears on ApplicationDetail page
 *
 * MinIO-dependent tests (file upload) are covered by API tests in the
 * pytest suite to avoid requiring MinIO in every CI environment.
 */

async function loginAndGetToken(
  request: import("@playwright/test").APIRequestContext,
  user: { email: string; password: string },
): Promise<string> {
  const resp = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
    form: { username: user.email, password: user.password },
  });
  if (!resp.ok()) {
    throw new Error(`Login failed: ${resp.status()} ${await resp.text()}`);
  }
  const { access_token } = await resp.json();
  return access_token as string;
}

// ---------------------------------------------------------------------------
// Documents page — navigation and empty state
// ---------------------------------------------------------------------------

test.describe("Documents page", () => {
  test("Documents nav link leads to the Documents page with empty state", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Documents via sidebar
      await page.getByRole("link", { name: /documents/i }).first().click();
      await page.waitForURL("**/documents");

      // Page heading
      await expect(page.getByRole("heading", { name: /documents/i })).toBeVisible();

      // Empty state — no documents yet
      await expect(page.getByText(/No documents yet/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

// ---------------------------------------------------------------------------
// Create text document and verify it appears in the list
// ---------------------------------------------------------------------------

test.describe("Document CRUD — text document", () => {
  test("creating a text document shows it in the list", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Documents page
      await page.getByRole("link", { name: /documents/i }).first().click();
      await page.waitForURL("**/documents");

      // Open the add document dialog
      await page.getByRole("button", { name: /add document/i }).click();

      // The dialog should open
      await expect(page.getByText("Add Document")).toBeVisible({ timeout: 5_000 });

      // Switch to text mode
      await page.getByRole("button", { name: "Write text" }).click();

      // Fill in the form
      await page.getByLabel(/title/i).fill("My E2E Cover Letter");
      await page.getByLabel(/content/i).fill("This is my cover letter content for E2E testing.");

      // Submit
      await page.getByRole("button", { name: /create/i }).click();

      // Dialog should close and document should appear in the list
      await expect(page.getByText("Add Document")).not.toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("My E2E Cover Letter")).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("deleting a document removes it from the list", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      const token = await loginAndGetToken(request, user);

      // Create a document via the API so we don't depend on the create dialog flow here
      const createResp = await request.post(`${BACKEND_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: "Document To Delete",
          kind: "other",
          body: "Will be deleted.",
        },
      });
      expect(createResp.ok()).toBeTruthy();

      // Navigate to Documents page
      await page.getByRole("link", { name: /documents/i }).first().click();
      await page.waitForURL("**/documents");

      // Document should be visible
      await expect(page.getByText("Document To Delete")).toBeVisible({ timeout: 5_000 });

      // Click the delete button (title="Delete")
      page.on("dialog", (dialog) => dialog.accept());
      await page.getByTitle("Delete").click();

      // Document should disappear
      await expect(page.getByText("Document To Delete")).not.toBeVisible({ timeout: 5_000 });

      // Empty state should appear again
      await expect(page.getByText(/No documents yet/i)).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

// ---------------------------------------------------------------------------
// Documents section on ApplicationDetail
// ---------------------------------------------------------------------------

test.describe("Documents section on ApplicationDetail", () => {
  test("ApplicationDetail shows the Documents section", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);
      const token = await loginAndGetToken(request, user);

      // Create a company
      const companyResp = await request.post(`${BACKEND_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { name: "E2E Test Corp" },
      });
      expect(companyResp.ok()).toBeTruthy();
      const companyId = (await companyResp.json()).id;

      // Create an application
      const appResp = await request.post(`${BACKEND_URL}/api/applications`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          company_id: companyId,
          role_title: "E2E Engineer",
          source: "other",
        },
      });
      expect(appResp.ok()).toBeTruthy();
      const appId = (await appResp.json()).id;

      // Navigate to the application detail page
      await page.goto(`/applications/${appId}`);
      await page.waitForURL(`**/applications/${appId}`);

      // The Documents section heading should be visible
      await expect(page.getByRole("heading", { name: /documents/i, level: 2 })).toBeVisible();

      // The "Add document" button for this application should be present
      await expect(page.getByRole("button", { name: /add document/i })).toBeVisible();

      // Empty state for no documents yet
      await expect(page.getByText(/No documents yet/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

// ---------------------------------------------------------------------------
// API-level validation tests (no MinIO needed)
// ---------------------------------------------------------------------------

test.describe("Documents API validation", () => {
  test("POST /api/documents rejects invalid kind with 422", async ({ request }) => {
    const user = await createTestUser(request);

    try {
      const token = await loginAndGetToken(request, user);

      const resp = await request.post(`${BACKEND_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { title: "Bad Kind", kind: "not_a_valid_kind", body: "some text" },
      });

      expect(resp.status()).toBe(422);
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("GET /api/documents/{id} for another user's document returns 404", async ({
    request,
  }) => {
    const userA = await createTestUser(request);
    const userB = await createTestUser(request);

    try {
      const tokenA = await loginAndGetToken(request, userA);
      const tokenB = await loginAndGetToken(request, userB);

      // User A creates a document
      const createResp = await request.post(`${BACKEND_URL}/api/documents`, {
        headers: { Authorization: `Bearer ${tokenA}` },
        data: { title: "A's Secret Doc", kind: "cover_letter", body: "private" },
      });
      expect(createResp.ok()).toBeTruthy();
      const docId = (await createResp.json()).id;

      // User B tries to access it
      const getResp = await request.get(`${BACKEND_URL}/api/documents/${docId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      expect(getResp.status()).toBe(404);
    } finally {
      await deleteTestUser(request, userA);
      await deleteTestUser(request, userB);
    }
  });
});
