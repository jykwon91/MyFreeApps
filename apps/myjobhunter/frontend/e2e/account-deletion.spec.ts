import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

const EXPECTED_TOP_LEVEL_KEYS = [
  "exported_at",
  "user",
  "profiles",
  "work_history",
  "education",
  "skills",
  "screening_answers",
  "companies",
  "company_research",
  "research_sources",
  "applications",
  "application_events",
  "application_contacts",
  "documents",
  "job_board_credentials",
  "resume_upload_jobs",
  "extraction_logs",
];

test.describe("MyJobHunter account deletion + data export", () => {
  test("register → export contains expected payload → delete account → cannot log in", async ({
    page,
    request,
  }) => {
    // 1. Create a test user and log in via UI.
    const user = await createTestUser(request);
    let cleanup: typeof deleteTestUser | null = deleteTestUser;
    try {
      await loginViaUI(page, user);
      await expect(page).toHaveURL(/\/dashboard/);

      // 2. Navigate to the Security page.
      await page.goto("/security");
      await expect(
        page.getByRole("heading", { name: "Security" }),
      ).toBeVisible();
      await expect(page.getByText(/Data & Privacy/i)).toBeVisible();

      // 3. Trigger the export download. Use Playwright's request fixture
      //    rather than the browser's download API so we can assert on the
      //    parsed JSON contents directly.
      const tokenCookie = await page.evaluate(() => localStorage.getItem("token"));
      expect(tokenCookie).not.toBeNull();
      const exportResponse = await request.get(
        `${process.env.BACKEND_URL ?? "http://localhost:8002"}/api/users/me/export`,
        {
          headers: { Authorization: `Bearer ${tokenCookie}` },
        },
      );
      expect(exportResponse.status()).toBe(200);
      const dispo = exportResponse.headers()["content-disposition"] ?? "";
      expect(dispo).toContain("attachment");
      expect(dispo).toContain("myjobhunter-export-");

      const exported = await exportResponse.json();
      for (const key of EXPECTED_TOP_LEVEL_KEYS) {
        expect(exported, `expected key '${key}' in export`).toHaveProperty(key);
      }
      expect(exported.user.email).toBe(user.email);

      // Sensitive fields must not appear anywhere in the payload.
      const raw = JSON.stringify(exported);
      expect(raw).not.toContain("hashed_password");
      expect(raw).not.toContain("totp_secret");
      expect(raw).not.toContain("totp_recovery_codes");
      expect(raw).not.toContain("encrypted_credentials");

      // 4. Open the Delete Account modal and submit.
      await page.getByRole("button", { name: /Delete my account/i }).click();
      await expect(
        page.getByRole("heading", { name: /Delete account permanently/i }),
      ).toBeVisible();

      await page.getByLabel(/Type your email/i).fill(user.email);
      await page.getByLabel(/^Password$/i).fill(user.password);
      await page.getByRole("button", { name: /Delete forever/i }).click();

      // 5. Successful delete → frontend signs out → redirect to /login.
      await page.waitForURL("**/login", { timeout: 10_000 });

      // 6. Login should now fail because the user row is gone.
      await page.getByLabel(/email/i).fill(user.email);
      await page.getByLabel(/password/i).fill(user.password);
      await page.getByRole("button", { name: /sign in/i }).click();

      // fastapi-users returns 400 on bad credentials; the LoginForm surfaces
      // a generic error message. Just assert we did NOT make it to /dashboard.
      await page.waitForTimeout(2000);
      await expect(page).not.toHaveURL(/\/dashboard/);
      // The user row is gone — no cleanup needed.
      cleanup = null;
    } finally {
      if (cleanup) {
        await cleanup(request, user);
      }
    }
  });
});
