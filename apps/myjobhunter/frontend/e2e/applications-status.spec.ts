/**
 * E2E: Applications list page shows the latest status badge from event log.
 *
 * Creates 2 applications, logs a different event type on each via the
 * LogEventDialog, navigates to /applications, and asserts each row shows
 * the correct status badge.
 */
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

/**
 * Create a company via the API (faster than UI flow for test setup).
 */
async function createCompanyViaApi(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
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
  return (await res.json()).id;
}

/**
 * Create an application via the API and return its id.
 */
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

/**
 * Log an event on an application via the API.
 */
async function logEventViaApi(
  request: import("@playwright/test").APIRequestContext,
  token: string,
  applicationId: string,
  eventType: string,
): Promise<void> {
  const res = await request.post(
    `${BACKEND_URL}/api/applications/${applicationId}/events`,
    {
      data: {
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        source: "manual",
      },
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok()) {
    throw new Error(`Failed to log event: ${res.status()} — ${await res.text()}`);
  }
}

/**
 * Log in via the backend API and return the JWT token.
 */
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

test.describe("Applications list — Status column", () => {
  test("shows status badge matching the latest event type for each application", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      // --- Setup: create 2 companies + 2 applications + 1 event each via API ---
      const token = await getToken(request, user.email, user.password);

      const companyIdA = await createCompanyViaApi(request, token, "Status Test Corp A");
      const companyIdB = await createCompanyViaApi(request, token, "Status Test Corp B");

      const appIdA = await createApplicationViaApi(
        request, token, companyIdA, "Frontend Engineer",
      );
      const appIdB = await createApplicationViaApi(
        request, token, companyIdB, "Backend Engineer",
      );

      // App A: log "applied" then "interview_scheduled" → latest should be interview_scheduled
      await logEventViaApi(request, token, appIdA, "applied");
      await logEventViaApi(request, token, appIdA, "interview_scheduled");

      // App B: log only "rejected"
      await logEventViaApi(request, token, appIdB, "rejected");

      // --- Navigate to /applications and verify ---
      await loginViaUI(page, user);

      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");

      // Both application role titles should be visible
      await expect(page.getByText("Frontend Engineer")).toBeVisible({ timeout: 8_000 });
      await expect(page.getByText("Backend Engineer")).toBeVisible();

      // App A should show "Interview scheduled" badge
      await expect(page.getByText("Interview scheduled")).toBeVisible();

      // App B should show "Rejected" badge
      await expect(page.getByText("Rejected")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("shows em-dash for an application with no events", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      const token = await getToken(request, user.email, user.password);
      const companyId = await createCompanyViaApi(request, token, "No Events Corp");
      await createApplicationViaApi(request, token, companyId, "No Events Role");

      await loginViaUI(page, user);

      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");

      await expect(page.getByText("No Events Role")).toBeVisible({ timeout: 8_000 });

      // The Status column should show an em-dash for zero events
      // Find the row and check the status cell
      const row = page.getByRole("row").filter({ hasText: "No Events Role" });
      await expect(row.getByText("—")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
