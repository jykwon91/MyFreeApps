/**
 * Serve-only mode — the operator's sign-in. Players never sign in, but the operator does, at the
 * unlinked /login, to triage feature requests. Signed in, the guest shell stays (public nav only) with
 * just Triage, Two-factor and Sign out added — serve-only mounts no other signed-in API — and /security
 * offers two-factor only. Login, `/users/me`, the TOTP status and the triage inbox are mocked; every other
 * /api call answers 404. No backend needed.
 *
 * Run: npx playwright test --config=playwright.layout.serve-only.config.ts serve-only-operator
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@platform/ui/test-support/crashGuard";

const TRIAGE = "/wow-forever/triage";
const OPERATOR_EMAIL = "operator@fixture.example";
const OPERATOR_PASSWORD = "fixture-password-not-a-secret";
/** A JWT-shaped fixture (never signed; the app only reads `exp`). Standard base64, as the app's atob reads it. */
const FIXTURE_TOKEN = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64"),
  Buffer.from(JSON.stringify({ sub: "fixture-operator", exp: 4102444800 })).toString("base64"),
  "fixture-signature",
].join(".");

async function mockOperatorApi(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => route.fulfill({ status: 404, json: { detail: "Not Found" } }),
  );
  await page.route("**/api/auth/totp/login", (route) =>
    route.fulfill({ json: { access_token: FIXTURE_TOKEN, token_type: "bearer" } }),
  );
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      json: { id: "fixture-operator", email: OPERATOR_EMAIL, is_active: true, is_superuser: true, is_verified: true },
    }),
  );
  await page.route("**/api/auth/totp/status", (route) => route.fulfill({ json: { enabled: false } }));
  await page.route("**/wow/feature-requests/triage/**", (route) => {
    if (route.request().headers()["authorization"] !== `Bearer ${FIXTURE_TOKEN}`) {
      return route.fulfill({ status: 401, json: { detail: "Unauthorized" } });
    }
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/inbox")) return route.fulfill({ json: { items: [], total_untriaged: 0 } });
    return route.fulfill({ json: { items: [] } });
  });
}

async function signInFromTriage(page: Page): Promise<void> {
  await page.goto(TRIAGE);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(OPERATOR_EMAIL);
  await page.getByLabel("Password").fill(OPERATOR_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${TRIAGE}$`));
  await expect(page.getByTestId("triage-workspace")).toBeVisible();
}

test.describe("MGA serve-only mode — operator sign-in", () => {
  test("signing in from triage returns there, adding only Triage / Two-factor / Sign out to the guest shell", async ({
    page,
  }) => {
    await mockOperatorApi(page);
    await signInFromTriage(page);

    const operator = page.getByTestId("serve-only-operator-actions");
    await expect(operator.getByRole("link", { name: "Triage" })).toBeVisible();
    await expect(operator.getByRole("link", { name: "Two-factor" })).toBeVisible();
    await expect(operator.getByRole("button", { name: "Sign out" })).toBeVisible();

    // Still the guest shell: no operator pages whose APIs serve-only doesn't mount, no user menu.
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: /games/i })).toBeVisible();
    for (const name of [/^sources$/i, /^review$/i, /^settings$/i, /^security$/i]) {
      await expect(sidebar.getByRole("link", { name })).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: new RegExp(OPERATOR_EMAIL) })).toHaveCount(0);
  });

  test("/security offers two-factor only", async ({ page }) => {
    await mockOperatorApi(page);
    await signInFromTriage(page);
    await page.getByTestId("serve-only-operator-actions").getByRole("link", { name: "Two-factor" }).click();

    await expect(page).toHaveURL(/\/security$/);
    await expect(page.getByRole("heading", { name: "Two-Factor Authentication" })).toBeVisible();
    await expect(page.getByText("Display name")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Data & Privacy" })).toHaveCount(0);
  });

  test("Sign out ends the session and the operator links go with it", async ({ page }) => {
    await mockOperatorApi(page);
    await signInFromTriage(page);

    await page.getByTestId("serve-only-operator-actions").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId("serve-only-operator-actions")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  });
});
