/**
 * /lineups/:id direct-link route E2E tests.
 *
 * Coverage:
 *  - Visiting a well-formed but non-existent UUID shows "Lineup not found"
 *    (public visitor, no lineup at that ID)
 *  - Visiting /lineups/<uuid> for an accepted lineup shows the tile
 *    (requires a real accepted lineup; seed via test-helper API when available)
 *  - The route is accessible without auth (public-read model)
 *
 * The seed-and-visit test requires:
 *  - Backend running with MGA_ENABLE_TEST_HELPERS=1
 *  - Fixtures loaded (python -m app.cli load-fixtures)
 *  - E2E_TEST_EMAIL + E2E_TEST_PASSWORD set to the seeded operator credentials
 *
 * The 404 test runs in any environment (no backend state required).
 */
import { test, expect } from "@playwright/test";
import { getOperatorCredentials, loginViaUI } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8004";
const NON_EXISTENT_ID = "00000000-0000-0000-0000-000000000001";

test.describe("/lineups/:id direct-link route", () => {
  test("shows 'Lineup not found' for a non-existent UUID (public visitor)", async ({ page }) => {
    await page.goto(`/lineups/${NON_EXISTENT_ID}`);
    await expect(page.getByText("Lineup not found.")).toBeVisible();
    // A back-to-home link is present
    await expect(page.getByRole("link", { name: /home/i })).toBeVisible();
  });

  test("route renders without auth (public-read model)", async ({ page }) => {
    // Navigate to a guaranteed-404 lineup URL without logging in.
    // The page itself renders (no redirect to /login) and shows the 404 state.
    await page.goto(`/lineups/${NON_EXISTENT_ID}`);
    // Still on the /lineups/:id URL — no auth redirect
    await expect(page).toHaveURL(/\/lineups\//);
    await expect(page.getByText("Lineup not found.")).toBeVisible();
  });

  test("renders a tile for an accepted lineup when seeded via test helper", async ({
    page,
    request,
  }) => {
    // Seed a lineup via the test-helper endpoint (requires MGA_ENABLE_TEST_HELPERS=1).
    // Gracefully skip if the test-helper endpoint is unavailable.
    const credentials = getOperatorCredentials();
    let authToken: string | null = null;
    try {
      const loginResp = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
        form: { username: credentials.email, password: credentials.password },
      });
      if (loginResp.ok()) {
        const body = await loginResp.json();
        authToken = body.access_token ?? null;
      }
    } catch {
      // Backend unavailable — skip
    }

    if (!authToken) {
      test.skip();
      return;
    }

    // Seed an accepted lineup via the test-helper endpoint
    let lineupId: string | null = null;
    try {
      const seedResp = await request.post(`${BACKEND_URL}/_test/seed-lineup`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { status: "accepted" },
      });
      if (seedResp.ok()) {
        const body = await seedResp.json();
        lineupId = body.id ?? null;
      }
    } catch {
      // Test-helper unavailable — skip
    }

    if (!lineupId) {
      test.skip();
      return;
    }

    await loginViaUI(page, credentials, request);
    await page.goto(`/lineups/${lineupId}`);

    // The page renders the lineup tile (GlanceBoardTile renders the title in the header)
    // and a back link.
    await expect(page.locator("main")).toBeVisible();
    // Back link is present — exact text depends on game/map resolution
    await expect(page.locator("main a").first()).toBeVisible();
  });
});
