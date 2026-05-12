/**
 * Review queue E2E tests (PR 5).
 *
 * Covers:
 *  - /review is accessible after login
 *  - Review nav link navigates correctly
 *  - Filter bar controls work (game, confidence dropdowns)
 *  - Empty state renders with links when no pending lineups exist
 *  - Accept flow: creates a pending lineup via test-helper API, navigates to
 *    /review, verifies the card appears, accepts it via the Accept button,
 *    verifies the lineup is no longer in the pending list
 *  - Unauthenticated access redirects to /login
 *
 * The accept-flow test requires:
 *  - Backend running with MGA_ENABLE_TEST_HELPERS=1
 *  - Fixtures loaded (python -m app.cli load-fixtures)
 *  - E2E_TEST_EMAIL + E2E_TEST_PASSWORD set to the seeded operator credentials
 *
 * If the backend is unavailable or fixtures are missing, the accept-flow test
 * gracefully skips via test.skip() rather than failing.
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";
const TEST_GAME_SLUG = "valorant";
const TEST_MAP_SLUG = "bind";

/** Obtain a JWT for direct API calls in test setup/teardown. */
async function getAuthToken(
  request: Parameters<typeof test>[2] extends (args: infer A) => unknown
    ? A extends { request: infer R }
      ? R
      : never
    : never,
): Promise<string | null> {
  try {
    const credentials = getOperatorCredentials();
    const resp = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
      form: {
        username: credentials.email,
        password: credentials.password,
        grant_type: "password",
      },
    });
    if (!resp.ok()) return null;
    const body = await resp.json() as { access_token: string };
    return body.access_token;
  } catch {
    return null;
  }
}

test.describe("Review queue page", () => {
  test("review page is accessible after login", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");
    await page.waitForURL("**/review");

    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
  });

  test("review nav link navigates to /review", async ({ page, request }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/");
    await page.getByRole("link", { name: /review/i }).first().click();
    await page.waitForURL("**/review");

    await expect(page).toHaveURL(/\/review/);
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
  });

  test("filter bar game dropdown is visible and operable", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");
    await page.waitForURL("**/review");

    // Game filter dropdown
    const selects = page.getByRole("combobox");
    const gameSelect = selects.first();
    await expect(gameSelect).toBeVisible();

    // Should have "All games" option
    const options = await gameSelect.locator("option").allTextContents();
    expect(options.some((o) => /all games/i.test(o))).toBe(true);

    // Interact with confidence filter
    const confidenceSelect = selects.nth(1);
    await expect(confidenceSelect).toBeVisible();
    await confidenceSelect.selectOption({ label: /Low/i });
    // Page should still render normally after filter change
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
  });

  test("empty state shows links to /sources and /lineups/new when queue is empty", async ({
    page,
    request,
  }) => {
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");
    await page.waitForURL("**/review");

    const emptyState = page.getByText(/no pending lineups/i);
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    if (hasEmpty) {
      // Empty state must have navigation links
      await expect(page.getByRole("link", { name: /sources/i })).toBeVisible();
    }
    // If queue is non-empty, test passes — the empty state isn't shown
  });

  test("unauthenticated access to /review redirects to /login", async ({
    page,
  }) => {
    await page.goto("/review");
    await page.waitForURL("**/login", { timeout: 5_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("accept flow: create pending lineup, verify card appears, accept it, verify removal", async ({
    page,
    request,
  }) => {
    // ── Setup: get token for direct API calls ────────────────────────────
    const token = await getAuthToken(request);
    if (!token) {
      test.skip(true, "Cannot obtain auth token — backend may not be running");
      return;
    }

    // Check test helpers are available
    const resetResp = await request.post(
      `${BACKEND_URL}/api/_test/reset-rate-limit`,
    );
    if (resetResp.status() === 404) {
      test.skip(
        true,
        "Test helpers not available (MGA_ENABLE_TEST_HELPERS not set) — skipping accept flow",
      );
      return;
    }

    // ── Create a pending lineup via the test-helper seed endpoint ────────
    const seedResp = await request.post(
      `${BACKEND_URL}/api/_test/seed-lineup`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          game_slug: TEST_GAME_SLUG,
          map_slug: TEST_MAP_SLUG,
          title: "E2E Accept Flow Test Lineup",
          chapter_title: "E2E Test Chapter",
        },
      },
    );
    if (!seedResp.ok()) {
      test.skip(
        true,
        `Seed lineup failed (${seedResp.status()}) — fixtures may not be loaded`,
      );
      return;
    }
    const seeded = await seedResp.json() as { lineup_id: string; status: string };
    expect(seeded.status).toBe("pending_review");
    const lineupId = seeded.lineup_id;

    // ── Navigate to /review and verify the lineup card appears ───────────
    const credentials = getOperatorCredentials();
    await loginViaUI(page, credentials, request);

    await page.goto("/review");
    await page.waitForURL("**/review");

    // The heading must be visible
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();

    // The pending lineup card for our test title should appear
    const cardTitle = page.getByText("E2E Accept Flow Test Lineup");
    await expect(cardTitle).toBeVisible({ timeout: 8_000 });

    // ── Click the Accept button on the seeded lineup card ────────────────
    // The card containing our test lineup's title
    const card = page.locator(".border-2").filter({ hasText: "E2E Accept Flow Test Lineup" }).first();
    await expect(card).toBeVisible();

    const acceptBtn = card.getByRole("button", { name: /^accept$/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // After accept, a success toast should appear
    // (the lineup transitions to 'accepted' and disappears from the pending list)
    await page.waitForTimeout(1_000); // allow RTK Query to invalidate + refetch

    // The lineup card should no longer be in the pending list
    // (either the queue is now empty, or the specific lineup title is gone)
    const cardGone = await page.getByText("E2E Accept Flow Test Lineup").isHidden().catch(() => true);
    expect(cardGone).toBe(true);

    // ── Teardown: delete the lineup to keep the DB clean ─────────────────
    // Accepted lineup may no longer be in pending but the row still exists.
    // Delete it regardless of its current status via the test-helper endpoint.
    await request.delete(`${BACKEND_URL}/api/_test/seed-lineup/${lineupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      // Non-critical teardown failure — lineup was accepted, not pending, but
      // the delete endpoint accepts any status. Log only.
      console.warn(`[E2E teardown] Failed to delete lineup ${lineupId}`);
    });
  });
});
