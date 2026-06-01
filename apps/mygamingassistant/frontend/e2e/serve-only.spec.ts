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
import { test, expect, type APIRequestContext } from "@playwright/test";

// The serve-only FRONTEND talks to the SAME backend the full-auth E2E uses
// (:8004). That backend still has the operator API + test helpers, so we seed
// real data through it, then verify the serve-only UI reads it publicly and
// offers no mutation. Seeding is operator-authed; the serve-only bundle itself
// has no login, which is the whole point.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";

interface SeededLineup {
  id: string;
  token: string;
}

/**
 * Seed an accepted lineup via the operator API + test-helper. Returns null when
 * the backend / helpers / credentials are unavailable so the caller can skip.
 */
async function seedAcceptedLineup(
  request: APIRequestContext,
): Promise<SeededLineup | null> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) return null;

  let token: string | null = null;
  try {
    const loginResp = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
      form: { username: email, password },
    });
    if (loginResp.ok()) token = (await loginResp.json()).access_token ?? null;
  } catch {
    return null;
  }
  if (!token) return null;

  try {
    const seedResp = await request.post(`${BACKEND_URL}/_test/seed-lineup`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { status: "accepted" },
    });
    if (!seedResp.ok()) return null;
    const id = (await seedResp.json()).id ?? null;
    return id ? { id, token } : null;
  } catch {
    return null;
  }
}

/** Best-effort cleanup of a seeded lineup via the operator delete endpoint. */
async function deleteLineup(
  request: APIRequestContext,
  seeded: SeededLineup,
): Promise<void> {
  try {
    await request.delete(`${BACKEND_URL}/api/lineups/${seeded.id}`, {
      headers: { Authorization: `Bearer ${seeded.token}` },
    });
  } catch {
    // non-fatal — the test DB is reset between CI runs.
  }
}

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

  test("end-to-end: a seeded accepted lineup is PUBLICLY readable in serve-only with NO mutation affordance, and the operator API is still gated", async ({
    page,
    request,
  }) => {
    // (a) Create test data: seed an accepted lineup via the operator API.
    const seeded = await seedAcceptedLineup(request);
    test.skip(seeded === null, "backend/test-helpers/credentials unavailable");
    if (!seeded) return;

    try {
      // (b) Perform the user action: a public (unauthenticated) serve-only
      //     visitor opens the lineup detail page directly.
      await page.goto(`/lineups/${seeded.id}`);

      // (c) Verify the outcome: the public read works end-to-end — the detail
      //     page renders the lineup (not the "not found" state, not a redirect
      //     to a login that doesn't exist), and stays on the lineups URL.
      await expect(page).toHaveURL(new RegExp(`/lineups/${seeded.id}`));
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText("Lineup not found.")).toHaveCount(0);

      // The serve-only UI must expose NO write affordance on the lineup:
      // no edit / delete / accept / hide controls reach the public bundle.
      await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /accept/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /hide/i })).toHaveCount(0);
      // And no Sign-in CTA anywhere on the detail page.
      await expect(page.getByTestId("topbar-sign-in")).toHaveCount(0);

      // Backend fail-closed cross-check: an unauthenticated mutation against the
      // same backend the serve-only bundle uses is rejected (the full-auth
      // backend still gates writes; the serve-only bundle simply never offers
      // them). A successful delete here would be a data-integrity failure.
      const unauthedDelete = await request.delete(
        `${BACKEND_URL}/api/lineups/${seeded.id}`,
      );
      expect(unauthedDelete.ok()).toBeFalsy();
      expect([401, 403, 404]).toContain(unauthedDelete.status());

      // The lineup must still be readable publicly after the rejected mutation.
      const publicRead = await request.get(
        `${BACKEND_URL}/api/lineups/${seeded.id}`,
      );
      expect(publicRead.ok()).toBeTruthy();
      expect((await publicRead.json()).id).toBe(seeded.id);
    } finally {
      // (d) Cleanup: remove the seeded lineup via the operator API.
      await deleteLineup(request, seeded);
    }
  });
});
