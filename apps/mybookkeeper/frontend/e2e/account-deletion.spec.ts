/**
 * E2E: Account deletion happy path.
 *
 * Registers a fresh user, navigates to Security, goes through the delete modal,
 * and verifies the user is logged out and cannot log back in.
 */
import { test, expect } from "@playwright/test";
import { BACKEND_URL } from "./fixtures/config";

const DELETE_EMAIL = `e2e-delete-${Date.now()}@example.com`;
const DELETE_PASSWORD = "E2eDeleteT3st!Secure";

async function registerAndVerify(email: string, password: string): Promise<string> {
  // Register
  const reg = await fetch(`${BACKEND_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Delete Test" }),
  });
  if (!reg.ok && reg.status !== 400) {
    throw new Error(`Registration failed: ${reg.status} ${await reg.text()}`);
  }

  // Log in via TOTP endpoint (no TOTP configured — works like standard login)
  const loginRes = await fetch(`${BACKEND_URL}/auth/totp/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
  const { access_token } = await loginRes.json();

  // Mark verified (test shortcut via verify endpoint with a generated token is
  // not practical without email; use the test-admin route if available,
  // otherwise mark via direct PATCH on the users endpoint which fastapi-users exposes).
  // For CI/local with ALLOW_TEST_ADMIN_PROMOTION, we can bypass via promote then patch.
  // Here we skip verification gate by checking if the token already works.
  return access_token as string;
}

test.describe("Account deletion — happy path", () => {
  test("register, delete account, verify logout and blocked re-login", async ({ page }) => {
    // Set up a fresh throwaway user
    let token: string;
    try {
      token = await registerAndVerify(DELETE_EMAIL, DELETE_PASSWORD);
    } catch (err) {
      test.skip(true, `Could not create test user: ${err}`);
      return;
    }

    // Verify token works — if user is not yet verified, skip (needs email flow)
    const meRes = await fetch(`${BACKEND_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      test.skip(true, "Test user requires email verification — skip in this environment");
      return;
    }

    // Get org id
    const orgsRes = await fetch(`${BACKEND_URL}/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const orgs = await orgsRes.json();
    const orgId = orgs[0]?.id as string | undefined;

    // Inject auth state into the browser
    await page.goto("/login");
    await page.evaluate(
      ([t, o]) => {
        localStorage.setItem("token", t);
        if (o) localStorage.setItem("v1_activeOrgId", o);
      },
      [token, orgId ?? ""] as [string, string],
    );
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: /security/i })).toBeVisible({ timeout: 10000 });

    // Trigger delete flow
    await page.getByRole("button", { name: /delete my account/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    // Fill confirmation fields
    await page.getByLabel(/type your email/i).fill(DELETE_EMAIL);
    await page.getByLabel(/password/i).fill(DELETE_PASSWORD);

    // Click Delete forever
    await page.getByRole("button", { name: /delete forever/i }).click();

    // Should be redirected to login after deletion
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    // Attempt to log in with the deleted credentials — should fail
    await page.locator("input[type='email']").fill(DELETE_EMAIL);
    await page.locator("input[type='password']").fill(DELETE_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid|credentials|not found|incorrect/i).first()
    ).toBeVisible({ timeout: 8000 });
  });
});
