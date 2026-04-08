import { test, expect } from "@playwright/test";
import { test as authedTest } from "./fixtures/auth";

const RUN_ID = Date.now();

test.describe("Invite accept — unauthenticated", () => {
  test("invite page is publicly accessible and stays on the invite route", async ({ page }) => {
    // PR #213 made /invite/:token a public route with inline login/registration.
    await page.goto("/invite/fake-token-123");
    await expect(page).toHaveURL(/\/invite\/fake-token-123/, { timeout: 5000 });
  });

  test("invalid token shows an error or invite-not-found state", async ({ page }) => {
    await page.goto("/invite/test-invite-token");
    // The page should render something (error, expired, not-found, or the MyBookkeeper heading) —
    // it should NOT redirect to /login.
    await expect(page).toHaveURL(/\/invite\//);
    const errorOrInvalid = page.getByText(/invalid|expired|not found|failed/i).first();
    const heading = page.getByRole("heading", { name: "MyBookkeeper" }).first();
    await expect(errorOrInvalid.or(heading)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Invite accept — authenticated with invalid token", () => {
  // Use the authed fixture for these tests
  test("shows error for invalid invite token", async ({ page }) => {
    // Simulate authenticated state by setting a token
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("token", "fake-jwt-for-testing"));
    await page.goto("/invite/invalid-token-that-does-not-exist");

    // Should show either error state or redirect
    const error = page.getByText(/failed|invalid|expired|error/i).first();
    const redirect = page.getByRole("heading", { name: "MyBookkeeper" });
    await expect(error.or(redirect)).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Wrong-user invite flow (PR #214)
//
// When a user is signed in as a different email than the invite target, the
// InviteAccept page must show a "signed in as X, but invite is for Y" message
// with a sign-out CTA. Verified by mocking the public invite info endpoint so
// the page believes a valid invite exists for a different email.
// ---------------------------------------------------------------------------

authedTest.describe("Invite accept — wrong user detection (PR #214)", () => {
  authedTest(
    "signed-in user visiting an invite for a different email sees wrong-user message",
    async ({ authedPage: page }) => {
      const inviteTargetEmail = `e2e-wrong-user-${RUN_ID}@example.com`;
      const fakeToken = `fake-token-wrong-user-${RUN_ID}`;

      // Intercept the invite info endpoint so the page sees a valid invite for
      // a different email than the currently authenticated user.
      await page.route(`**/organizations/invites/${fakeToken}/info`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            email: inviteTargetEmail,
            org_name: "Test Org Wrong User",
            inviter_name: "Admin User",
            org_role: "user",
            is_expired: false,
            user_exists: false,
          }),
        });
      });

      await page.goto(`/invite/${fakeToken}`);

      // Expected wrong-user copy from InviteAccept.tsx:
      //   "You're signed in as <authed>, but this invite is for <target>."
      await expect(
        page.getByText(new RegExp(`this invite is for ${inviteTargetEmail}`, "i")),
      ).toBeVisible({ timeout: 10000 });

      // CTA button should offer to sign out and switch
      const switchBtn = page.getByRole("button", {
        name: new RegExp(`sign out and continue as ${inviteTargetEmail}`, "i"),
      });
      await expect(switchBtn).toBeVisible({ timeout: 5000 });
    },
  );

  authedTest(
    "clicking sign-out CTA on wrong-user invite clears the token",
    async ({ authedPage: page }) => {
      const inviteTargetEmail = `e2e-wrong-user-switch-${RUN_ID}@example.com`;
      const fakeToken = `fake-token-switch-${RUN_ID}`;

      await page.route(`**/organizations/invites/${fakeToken}/info`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            email: inviteTargetEmail,
            org_name: "Switch Org",
            inviter_name: "Admin",
            org_role: "user",
            is_expired: false,
            user_exists: true,
          }),
        });
      });

      await page.goto(`/invite/${fakeToken}`);

      const switchBtn = page.getByRole("button", {
        name: new RegExp(`sign out and continue as ${inviteTargetEmail}`, "i"),
      });
      await expect(switchBtn).toBeVisible({ timeout: 10000 });

      // Click triggers localStorage.removeItem("token") + reload
      await switchBtn.click();

      // After reload the token should be gone from localStorage
      await page.waitForLoadState("domcontentloaded");
      const tokenAfter = await page.evaluate(() => localStorage.getItem("token"));
      expect(tokenAfter).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// Inline registration (PR #213)
//
// The redesigned InviteAccept page serves a registration form directly when
// the invite is for a new user (user_exists=false) and no one is signed in.
// Verified by mocking the invite info endpoint and visiting the page as an
// unauthenticated user.
// ---------------------------------------------------------------------------

test.describe("Invite accept — inline registration form (PR #213)", () => {
  test("new user invite renders inline registration form with email locked", async ({
    page,
  }) => {
    const inviteEmail = `e2e-inline-reg-${RUN_ID}@example.com`;
    const fakeToken = `fake-token-inline-${RUN_ID}`;

    await page.route(`**/organizations/invites/${fakeToken}/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: inviteEmail,
          org_name: "Inline Reg Org",
          inviter_name: "Admin User",
          org_role: "user",
          is_expired: false,
          user_exists: false,
        }),
      });
    });

    // Visit as unauthenticated — the route protection should allow access to
    // /invite/:token because that route is public, OR redirect to login with
    // returnTo pointing back at the invite URL.
    // Ensure no stale auth — the default Playwright `page` fixture has no
    // token, but clear defensively in case a prior test leaked state.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("v1_activeOrgId");
    });

    await page.goto(`/invite/${fakeToken}`);

    // The registration form shows a disabled email input pre-filled with the
    // invite email, plus Name + Password fields and a "Create account & join" CTA.
    const emailInput = page.locator('input[type="email"][disabled]');
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    expect(await emailInput.inputValue()).toBe(inviteEmail);

    // Name field
    const nameInput = page.getByPlaceholder(/optional/i).first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    // Password field
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs.first()).toBeVisible({ timeout: 5000 });

    // CTA button
    const createBtn = page.getByRole("button", {
      name: /create account.*join inline reg org/i,
    });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
  });

  test("returning user invite renders inline login form, not registration", async ({
    page,
  }) => {
    const inviteEmail = `e2e-inline-login-${RUN_ID}@example.com`;
    const fakeToken = `fake-token-login-${RUN_ID}`;

    await page.route(`**/organizations/invites/${fakeToken}/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: inviteEmail,
          org_name: "Returning Org",
          inviter_name: "Admin",
          org_role: "admin",
          is_expired: false,
          user_exists: true,
        }),
      });
    });

    // Ensure no stale auth — the default Playwright `page` fixture has no
    // token, but clear defensively in case a prior test leaked state.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("v1_activeOrgId");
    });

    await page.goto(`/invite/${fakeToken}`);

    // The login form shows a disabled email input + a password field + a
    // "Sign in & join" CTA (different wording from the register flow).
    const emailInput = page.locator('input[type="email"][disabled]');
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    expect(await emailInput.inputValue()).toBe(inviteEmail);

    const signInBtn = page.getByRole("button", {
      name: /sign in.*join returning org/i,
    });
    await expect(signInBtn).toBeVisible({ timeout: 5000 });

    // The "Create account" CTA should NOT be visible on the login variant
    await expect(
      page.getByRole("button", { name: /create account/i }),
    ).not.toBeVisible({ timeout: 3000 });
  });

  test("expired invite shows the expired state instead of a form", async ({ page }) => {
    const fakeToken = `fake-token-expired-${RUN_ID}`;

    await page.route(`**/organizations/invites/${fakeToken}/info`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          email: "someone@example.com",
          org_name: "Expired Org",
          inviter_name: "Jane Admin",
          org_role: "user",
          is_expired: true,
          user_exists: false,
        }),
      });
    });

    // Ensure no stale auth — the default Playwright `page` fixture has no
    // token, but clear defensively in case a prior test leaked state.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("v1_activeOrgId");
    });

    await page.goto(`/invite/${fakeToken}`);

    await expect(page.getByText(/invite expired/i)).toBeVisible({ timeout: 10000 });
    // No registration or login form on an expired invite
    await expect(
      page.getByRole("button", { name: /create account|sign in.*join/i }),
    ).not.toBeVisible({ timeout: 3000 });
  });
});
