/**
 * Serve-only mode E2E suite.
 *
 * Runs against a Vite dev server started with VITE_SERVE_ONLY=true (see
 * playwright.serve-only.config.ts). In serve-only mode MGA is a pure public
 * read-only lineup library with ZERO auth:
 *   - No "Sign in" CTA anywhere (the backend mounts no login route).
 *   - Gated routes (/settings, /sources, /review, /security, ...) redirect to
 *     the public home instead of showing the AuthRequired Sign-in card.
 *   - The standalone /login, /forgot-password, /reset-password, /verify-email
 *     routes redirect to home.
 *   - Public browse (games, packages) works unchanged.
 *
 * Prereqs: backend on :8004 with fixtures loaded (public read endpoints). No
 * operator credentials are needed — there is no login in this mode.
 *
 * Run: npm run test:e2e:serve-only
 */
import { test, expect } from "@playwright/test";

test.describe("MGA serve-only mode (public read-only, zero auth)", () => {
  test("home renders the public games library with NO Sign-in CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
    // The topbar Sign-in CTA from GuestShell must be absent in serve-only.
    await expect(page.getByTestId("topbar-sign-in")).toHaveCount(0);
    // No "Sign in" button text anywhere on the shell.
    await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
  });

  test("guest nav shows public-only items, not operator pages", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    // Public nav items are present.
    await expect(sidebar.getByRole("link", { name: /games/i })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /packages/i })).toBeVisible();
    // Operator-only nav items must NOT be advertised.
    await expect(sidebar.getByRole("link", { name: /^sources$/i })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: /^review$/i })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: /^settings$/i })).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: /^security$/i })).toHaveCount(0);
  });

  test("gated route /settings redirects to home (no Sign-in card)", async ({ page }) => {
    await page.goto("/settings");
    // AuthRequired redirects to home in serve-only mode.
    await page.waitForURL("**/", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/$/);
    // The full-auth "Sign in to manage your account" card must NOT appear.
    await expect(
      page.getByRole("heading", { name: /sign in to/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
  });

  test("gated route /sources redirects to home", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForURL("**/", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
  });

  test("standalone /login route redirects to home", async ({ page }) => {
    await page.goto("/login");
    await page.waitForURL("**/", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/$/);
    // The login form (email/password) must not be rendered.
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });

  test("standalone /forgot-password route redirects to home", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForURL("**/", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/$/);
  });

  test("public packages page is reachable without auth", async ({ page }) => {
    await page.goto("/packages");
    await expect(page).toHaveURL(/\/packages/);
    // No Sign-in CTA on the public packages page.
    await expect(page.getByTestId("topbar-sign-in")).toHaveCount(0);
  });

  test("games library lists Valorant and CS2 (public, fixtures loaded)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Games" })).toBeVisible();
    await expect(page.getByText("Valorant")).toBeVisible();
    await expect(page.getByText("CS2")).toBeVisible();
  });
});
