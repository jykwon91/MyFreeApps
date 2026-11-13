/**
 * No-backend E2E for the sign-in page: it renders, submits to the stubbed
 * /auth/totp/login endpoint, stores the token and lands signed in on the
 * dashboard; a rejected login shows the error and keeps the user on /login.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell, stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { unsignedJwt } from "@platform/ui/test-support/unsignedJwt";

const LOGIN_ENDPOINT = "**/api/auth/totp/login";

test("sign-in page renders the form", async ({ page }) => {
  await stubUnmatchedApi(page);
  await page.goto("/login");

  await expect(page.getByText("MyJobHunter").first()).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In", exact: true }).last()).toBeVisible();
});

test("submitting valid credentials posts them, stores the token and lands signed in", async ({ page }) => {
  await stubSignedInShell(page);
  // The shell stub plants a token; clear it so /login is shown to a signed-out visitor.
  await page.addInitScript(() => window.localStorage.removeItem("token"));
  // The auth guard only counts a token as signed in when it can read a future
  // `exp` from it, so the stubbed login hands back a decodable one.
  const accessToken = unsignedJwt();
  let body: Record<string, unknown> | null = null;
  await page.route(LOGIN_ENDPOINT, (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill(json({ access_token: accessToken, token_type: "bearer" }));
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign In", exact: true }).last().click();

  await expect(page).toHaveURL(/\/dashboard$/);
  // Only the signed-in shell renders the app's navigation; a token the guard
  // rejected would bounce back to /login instead.
  await expect(page.getByRole("link", { name: "Applications" }).first()).toBeVisible();
  expect(body).toMatchObject({ email: "test@example.com", password: "correct-horse-battery" });
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBe(accessToken);
});

test("a rejected login shows an error and stays on /login", async ({ page }) => {
  await stubUnmatchedApi(page);
  await page.route(LOGIN_ENDPOINT, (route) => route.fulfill(json({ detail: "LOGIN_BAD_CREDENTIALS" }, 400)));

  await page.goto("/login");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign In", exact: true }).last().click();

  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("a 2FA account is asked for its authenticator code", async ({ page }) => {
  await stubUnmatchedApi(page);
  await page.route(LOGIN_ENDPOINT, (route) => route.fulfill(json({ detail: "totp_required" })));

  await page.goto("/login");
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign In", exact: true }).last().click();

  await expect(page.getByLabel("Authentication code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify" })).toBeDisabled();
});
