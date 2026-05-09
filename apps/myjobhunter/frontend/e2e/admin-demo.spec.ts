/**
 * E2E test for the admin demo-management flow.
 *
 * Verifies the full operator journey:
 *   1. Promote a fresh test user to admin via the test-helper.
 *   2. Open /admin/demo and confirm the empty-state CTA shows.
 *   3. Create a demo account through the dialog.
 *   4. Confirm the credentials modal shows the email + password.
 *   5. Confirm the table now lists 1 demo account with applications=4
 *      and companies=3 (the seed counts).
 *   6. Log in as the demo account in a separate browser context and
 *      verify Applications + Companies + Profile render seeded content.
 *   7. Return to admin context and delete the demo account; confirm
 *      the table is empty again.
 *
 * The test uses a unique email per run so concurrent runs don't
 * collide. Cleanup deletes both the admin test user and any surviving
 * demo accounts from the page.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI, resetRateLimit } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

async function promoteToAdmin(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post(
    `${BACKEND_URL}/api/_test/promote-to-admin`,
    { data: { email } },
  );
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Failed to promote ${email} to admin: ${response.status()} — ${body}`,
    );
  }
}

async function bulkDeleteDemoUsers(
  request: APIRequestContext,
  adminToken: string,
): Promise<void> {
  // Grab whatever survives and delete each so a flaky run doesn't
  // leave orphan demo accounts piling up.
  const listResponse = await request.get(
    `${BACKEND_URL}/api/admin/demo/users`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  if (!listResponse.ok()) {
    return;
  }
  const body = (await listResponse.json()) as {
    users: { user_id: string }[];
  };
  for (const user of body.users) {
    await request.delete(
      `${BACKEND_URL}/api/admin/demo/users/${user.user_id}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
  }
}

test.describe("Admin demo accounts", () => {
  test("admin creates, lists, logs in as, and deletes a demo account", async ({
    page,
    browser,
    request,
  }) => {
    const adminUser = await createTestUser(request);
    let adminToken = "";

    try {
      // Step 1: Log in first (both API and UI), THEN promote.
      //
      // Why this order matters: fastapi-users' UserManager.authenticate() calls
      // user_db.update(result, clear_update) on every successful login, which
      // issues session.commit() against an ORM-cached user object that still has
      // is_superuser=False. That commit overwrites any raw-SQL promotion that
      // happened before the login. Promoting AFTER all logins avoids the race.

      // Get a token for cleanup — this login happens before promotion so it
      // won't interfere.
      // Reset rate limit before API login to prevent 429s during parallel runs.
      await resetRateLimit(request);
      const loginResp = await request.post(
        `${BACKEND_URL}/api/auth/jwt/login`,
        {
          form: { username: adminUser.email, password: adminUser.password },
        },
      );
      expect(loginResp.ok()).toBe(true);
      adminToken = (
        (await loginResp.json()) as { access_token: string }
      ).access_token;

      // Log in via UI so the browser has an auth session.
      await loginViaUI(page, adminUser, request);
      await expect(page).toHaveURL(/\/dashboard/);

      // NOW promote — no more logins will happen for this user after this point,
      // so the ORM-commit overwrite can't strike again.
      await promoteToAdmin(request, adminUser.email);

      // Clean up leftover demo accounts from previous broken runs.
      // Must happen AFTER promotion — the JWT token is checked against DB
      // is_superuser on every request, so the same token now grants admin access.
      await bulkDeleteDemoUsers(request, adminToken);

      // Navigate to /admin/demo. The page load triggers a fresh /users/me fetch
      // which will see is_superuser=true. RequireSuperuser waits for that fetch
      // before allowing or redirecting, so this is race-free.
      await page.goto("/admin/demo");
      await expect(
        page.getByRole("heading", { name: "Demo accounts", exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // Step 2: Empty state shows the CTA.
      const emptyHeading = page.getByRole("heading", {
        name: "No demo accounts yet",
      });
      await expect(emptyHeading).toBeVisible({ timeout: 10_000 });

      // Step 3: Open the create dialog.
      await page
        .getByRole("button", { name: /create demo account/i })
        .first()
        .click();

      const dialog = page.getByRole("dialog", {
        name: /create demo account/i,
      });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: /^create$/i }).click();

      // Step 4: Credentials modal appears.
      const credsDialog = page.getByRole("dialog", {
        name: /demo credentials/i,
      });
      await expect(credsDialog).toBeVisible({ timeout: 15_000 });

      const credsText = await credsDialog.textContent();
      expect(credsText).toBeTruthy();
      const emailMatch = credsText!.match(
        /demo\+[a-z0-9]+@myjobhunter-demo\.example\.com/i,
      );
      expect(emailMatch).not.toBeNull();
      const demoEmail = emailMatch![0];

      // The password is the second monospace block under the email.
      const passwordCells = credsDialog.locator("[data-credential-password]");
      const demoPassword = (await passwordCells.first().textContent())?.trim();
      expect(demoPassword).toBeTruthy();
      expect(demoPassword!.length).toBeGreaterThanOrEqual(16);

      await credsDialog.getByRole("button", { name: /close/i }).click();
      await expect(credsDialog).not.toBeVisible();

      // Step 5: Table now lists exactly one demo account.
      await expect(page.getByText(/1 demo account/i)).toBeVisible();
      await expect(page.getByText(demoEmail)).toBeVisible();
      // Application count = 4, Company count = 3 (seed shape).
      const row = page.getByTestId("demo-user-row");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("4");
      await expect(row).toContainText("3");

      // Step 6: Log in as the demo user in a fresh browser context.
      const demoContext = await browser.newContext();
      const demoPage = await demoContext.newPage();
      try {
        await demoPage.goto("/login");
        await demoPage.getByLabel(/email/i).fill(demoEmail);
        await demoPage.locator("#login-password").fill(demoPassword!);
        await demoPage.getByRole("button", { name: /sign in/i }).click();
        await demoPage.waitForURL(
          (url) => !url.pathname.includes("/login"),
          { timeout: 15_000 },
        );

        // Applications page shows seeded rows (NOT the empty state).
        await demoPage
          .getByRole("link", { name: /applications/i })
          .first()
          .click();
        await demoPage.waitForURL("**/applications");
        await expect(
          demoPage.getByRole("heading", { name: "Applications" }),
        ).toBeVisible({ timeout: 10_000 });
        // The seeded role titles include "Senior Backend Engineer".
        await expect(
          demoPage.getByText(/Senior Backend Engineer/i).first(),
        ).toBeVisible();

        // Companies page shows seeded entries.
        await demoPage
          .getByRole("link", { name: /companies/i })
          .first()
          .click();
        await demoPage.waitForURL("**/companies");
        await expect(demoPage.getByText(/Acme Corp/i).first()).toBeVisible({
          timeout: 10_000,
        });
      } finally {
        await demoContext.close();
      }

      // Step 7: Back on the admin page, delete the demo account.
      await page
        .getByRole("button", { name: `Delete ${demoEmail}` })
        .click();

      const confirmDialog = page.getByRole("dialog", {
        name: /delete demo account/i,
      });
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole("button", { name: /^delete$/i }).click();

      // Empty state is back.
      await expect(
        page.getByRole("heading", { name: "No demo accounts yet" }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      if (adminToken) {
        await bulkDeleteDemoUsers(request, adminToken);
      }
      await deleteTestUser(request, adminUser);
    }
  });
});
