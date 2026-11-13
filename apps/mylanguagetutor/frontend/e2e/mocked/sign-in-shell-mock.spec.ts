/**
 * No-backend E2E for signing in and the signed-in shell: a signed-out visitor
 * is sent to /login and back to where they were going once signed in; a
 * learner who has onboarded lands on their scenarios and a new one on the
 * language step; wrong credentials, an unverified email and a 2FA account each
 * get their own path; the shell shows the learner and its navigation, and
 * signing out ends the session.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ISSUED_TOKEN } from "@platform/ui/test-support/constants/issuedToken";
import { LOGIN_BAD_CREDENTIALS } from "@platform/ui/test-support/constants/loginBadCredentials";
import { LOGIN_ENDPOINT } from "@platform/ui/test-support/constants/loginEndpoint";
import { TEST_PASSWORD } from "@platform/ui/test-support/constants/testPassword";
import { WRONG_PASSWORD } from "@platform/ui/test-support/constants/wrongPassword";
import { json } from "@platform/ui/test-support/mockResponse";
import { TEST_USER, stubCurrentUser } from "@platform/ui/test-support/mockSession";
import { TOTP_CODE } from "./constants/accountCredentials";
import { RESEND_ENDPOINT } from "./constants/accountEndpoints";
import { LOGIN_USER_NOT_VERIFIED } from "./constants/refusalDetails";
import { BAD_CREDENTIALS_COPY, VERIFICATION_SENT_COPY, VERIFY_EMAIL_FIRST_COPY } from "./constants/signInCopy";
import { signedInTutor } from "./fixtures/signedInTutor";
import type { TutorApiStubOptions } from "./types/TutorApiStubOptions";

/** The tutor API is stubbed and the shell answers /users/me, but no token is planted: the visitor is signed out. */
async function signedOutVisitor(page: Page, options: TutorApiStubOptions = {}) {
  const api = await signedInTutor(page, options);
  await page.addInitScript(() => window.localStorage.removeItem("token"));
  return api;
}

/** POST /auth/totp/login answers `answer(body)`; returns every body sent. */
async function stubLogin(page: Page, answer: (body: Record<string, unknown>) => { body: unknown; status?: number }) {
  const sent: Record<string, unknown>[] = [];
  await page.route(LOGIN_ENDPOINT, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(body);
    const { body: reply, status } = answer(body);
    return route.fulfill(json(reply, status));
  });
  return sent;
}

async function submitLogin(page: Page, password = TEST_PASSWORD) {
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("signing in", () => {
  test("a signed-out visitor is sent to sign in, then back to the page they wanted", async ({ page }) => {
    await signedOutVisitor(page);
    const sent = await stubLogin(page, () => ({ body: { access_token: ISSUED_TOKEN, token_type: "bearer" } }));

    await page.goto("/security");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();

    await submitLogin(page);

    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    expect(sent).toEqual([{ email: TEST_USER.email, password: TEST_PASSWORD }]);
    expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBe(ISSUED_TOKEN);
  });

  test("a learner who has onboarded lands on their scenarios", async ({ page }) => {
    await signedOutVisitor(page);
    await stubLogin(page, () => ({ body: { access_token: ISSUED_TOKEN, token_type: "bearer" } }));

    await page.goto("/login");
    await submitLogin(page);

    await expect(page).toHaveURL(/\/scenarios$/);
    await expect(page.getByRole("heading", { name: "Practice Spanish" })).toBeVisible();
  });

  test("a new learner lands on the first onboarding step", async ({ page }) => {
    await signedOutVisitor(page, { profile: null });
    await stubLogin(page, () => ({ body: { access_token: ISSUED_TOKEN, token_type: "bearer" } }));

    await page.goto("/login");
    await submitLogin(page);

    await expect(page).toHaveURL(/\/onboarding\/language$/);
    await expect(page.getByRole("heading", { name: "What would you like to practice?" })).toBeVisible();
  });

  test("wrong credentials say so, keep the visitor on /login and store no token", async ({ page }) => {
    await signedOutVisitor(page);
    await stubLogin(page, () => ({ body: { detail: LOGIN_BAD_CREDENTIALS }, status: 400 }));

    await page.goto("/login");
    await submitLogin(page, WRONG_PASSWORD);

    await expect(page.getByRole("alert")).toHaveText(BAD_CREDENTIALS_COPY);
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
  });

  test("an unverified email is offered a new verification link, sent to that address", async ({ page }) => {
    await signedOutVisitor(page);
    await stubLogin(page, () => ({ body: { detail: LOGIN_USER_NOT_VERIFIED }, status: 400 }));
    const resent: unknown[] = [];
    await page.route(RESEND_ENDPOINT, (route) => {
      resent.push(route.request().postDataJSON());
      return route.fulfill(json(null, 202));
    });

    await page.goto("/login");
    await submitLogin(page);
    await expect(page.getByText(VERIFY_EMAIL_FIRST_COPY, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Resend verification email" }).click();

    await expect(page.getByText(VERIFICATION_SENT_COPY)).toBeVisible();
    expect(resent).toEqual([{ email: TEST_USER.email }]);
  });

  test("a 2FA account is asked for its code, which is sent with the same credentials", async ({ page }) => {
    await signedOutVisitor(page);
    const sent = await stubLogin(page, (body) =>
      body.totp_code ? { body: { access_token: ISSUED_TOKEN, token_type: "bearer" } } : { body: { detail: "totp_required" } },
    );

    await page.goto("/login");
    await submitLogin(page);
    const verify = page.getByRole("button", { name: "Verify" });
    await expect(page.getByLabel("Authentication code")).toBeVisible();
    await expect(verify).toBeDisabled();
    await page.getByLabel("Authentication code").fill(TOTP_CODE);
    await verify.click();

    await expect(page).toHaveURL(/\/scenarios$/);
    expect(sent).toEqual([
      { email: TEST_USER.email, password: TEST_PASSWORD },
      { email: TEST_USER.email, password: TEST_PASSWORD, totp_code: TOTP_CODE },
    ]);
  });
});

test.describe("signed-in shell", () => {
  test("shows the learner and the navigation, which moves between pages", async ({ page }) => {
    await signedInTutor(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/scenarios$/);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(page.getByText(TEST_USER.display_name, { exact: true })).toBeVisible();
    await expect(page.getByText(TEST_USER.email, { exact: true })).toBeVisible();

    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await nav.getByRole("link", { name: "Practice" }).click();
    await expect(page).toHaveURL(/\/scenarios$/);
    await expect(page.getByRole("heading", { name: "Practice Spanish" })).toBeVisible();
  });

  test("a learner without a display name is shown by their email's local part", async ({ page }) => {
    await signedInTutor(page);
    await stubCurrentUser(page, { ...TEST_USER, display_name: "" });

    await page.goto("/scenarios");
    await expect(page.getByText("test", { exact: true })).toBeVisible();
  });

  test("signing out clears the session and returns to /login", async ({ page }) => {
    await signedInTutor(page);

    await page.goto("/scenarios");
    await page.getByText(TEST_USER.display_name, { exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
  });
});
