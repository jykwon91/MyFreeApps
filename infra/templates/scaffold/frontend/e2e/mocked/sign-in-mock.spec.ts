/**
 * No-backend E2E for signing in: a signed-out operator is sent to /login and,
 * once signed in, lands on the home page (or back on the page they wanted),
 * with the shell showing who they are; wrong credentials say so and store no
 * token.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ISSUED_TOKEN } from "@platform/ui/test-support/constants/issuedToken";
import { LOGIN_BAD_CREDENTIALS } from "@platform/ui/test-support/constants/loginBadCredentials";
import { TEST_PASSWORD } from "@platform/ui/test-support/constants/testPassword";
import { WRONG_PASSWORD } from "@platform/ui/test-support/constants/wrongPassword";
import { TEST_USER, stubCurrentUser, stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { stubLogin } from "@platform/ui/test-support/stubLogin";
import { BAD_CREDENTIALS_COPY, LANDING_HEADING } from "./constants/signInCopy";

/** The API answers /users/me, but no token is planted: the operator is signed out. */
async function signedOutOperator(page: Page): Promise<void> {
  await stubUnmatchedApi(page);
  await stubCurrentUser(page, TEST_USER);
}

async function submitLogin(page: Page, password: string): Promise<void> {
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("signing in lands on the home page, with the operator shown in the shell", async ({ page }) => {
  await signedOutOperator(page);
  const sent = await stubLogin(page, { access_token: ISSUED_TOKEN, token_type: "bearer" });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeDisabled();

  await submitLogin(page, TEST_PASSWORD);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: LANDING_HEADING })).toBeVisible();
  await expect(page.getByText(TEST_USER.display_name, { exact: true })).toBeVisible();
  expect(sent).toEqual([{ email: TEST_USER.email, password: TEST_PASSWORD }]);
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBe(ISSUED_TOKEN);
});

test("a signed-out operator who opened Settings is returned to it after signing in", async ({ page }) => {
  await signedOutOperator(page);
  await stubLogin(page, { access_token: ISSUED_TOKEN, token_type: "bearer" });

  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  await submitLogin(page, TEST_PASSWORD);

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("wrong credentials say so, keep the operator on /login and store no token", async ({ page }) => {
  await signedOutOperator(page);
  const sent = await stubLogin(page, { detail: LOGIN_BAD_CREDENTIALS }, 400);

  await page.goto("/login");
  await submitLogin(page, WRONG_PASSWORD);

  await expect(page.getByRole("alert")).toHaveText(BAD_CREDENTIALS_COPY);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  expect(sent).toEqual([{ email: TEST_USER.email, password: WRONG_PASSWORD }]);
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
});
