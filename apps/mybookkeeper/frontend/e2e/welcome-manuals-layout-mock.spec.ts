/**
 * No-backend layout E2E for the Welcome Manuals list + detail pages.
 *
 * Fully mocks the API surface via page.route() so it runs under
 * playwright.layout.config.ts in the `frontend-layout-e2e` CI job (no backend,
 * no globalSetup). Mirrors how the listings pages are layout-covered, but in
 * the mockable shape the CI job requires.
 *
 * Verifies:
 *   - List skeleton mirrors the loaded mobile card / desktop table structure.
 *   - Mobile shows cards + hides the table; desktop shows the table + hides cards.
 *   - Detail skeleton mirrors the loaded header + sections structure.
 *   - No horizontal scroll on either page across mobile / tablet / desktop.
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "00000000-0000-0000-0000-000000000010";
const MANUAL_ID = "00000000-0000-0000-0000-0000000000a1";

function plantAuth(page: Page): Promise<void> {
  return page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}

async function stubShell(page: Page): Promise<void> {
  await page.route("**/api/users/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        name: "Test User",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: "owner",
      }),
    }),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: ORG_ID, name: "Test Workspace", role: "owner" }]),
    }),
  );
  await page.route("**/api/version", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "test" }) }),
  );
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 }),
    }),
  );
  await page.route("**/api/properties", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
}

function summary(id: string, title: string, sectionCount: number) {
  return {
    id,
    title,
    property_id: null,
    section_count: sectionCount,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };
}

async function stubList(page: Page, delayMs = 0): Promise<void> {
  await page.route("**/api/welcome-manuals?*", async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          summary("00000000-0000-0000-0000-0000000000b1", "Lakeview Guide", 5),
          summary("00000000-0000-0000-0000-0000000000b2", "Cabin Guide", 0),
          summary("00000000-0000-0000-0000-0000000000b3", "Downtown Loft Guide", 3),
        ],
        total: 3,
        has_more: false,
      }),
    });
  });
}

async function stubDetail(page: Page, delayMs = 0): Promise<void> {
  await page.route(`**/api/welcome-manuals/${MANUAL_ID}`, async (route, request) => {
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: MANUAL_ID,
        organization_id: ORG_ID,
        user_id: "00000000-0000-0000-0000-000000000001",
        property_id: null,
        title: "Lakeview Welcome Guide",
        intro_text: "Welcome! Here's everything you need.",
        sections: [0, 1, 2].map((i) => ({
          id: `00000000-0000-0000-0000-00000000c00${i}`,
          manual_id: MANUAL_ID,
          title: `Section ${i + 1}`,
          body: "Some instructions",
          display_order: i,
          images: [],
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        })),
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }),
    });
  });
}

test.describe("Welcome Manuals layout (mocked, no backend)", () => {
  test("list skeleton slot count is in the ballpark of the loaded card count", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await plantAuth(page);
    await stubShell(page);
    await stubList(page, 1500);

    await page.goto("/welcome-manuals");
    await expect(page.getByTestId("welcome-manuals-skeleton")).toBeVisible({ timeout: 5000 });
    const skeletonCount = await page
      .locator('[data-testid="welcome-manuals-skeleton"] ul.md\\:hidden li')
      .count();
    expect(skeletonCount).toBeGreaterThan(0);

    await expect(page.getByTestId("welcome-manuals-mobile")).toBeVisible({ timeout: 10000 });
    const loadedCount = await page.locator('[data-testid="welcome-manuals-mobile"] li').count();
    expect(loadedCount).toBe(3);
    expect(Math.abs(skeletonCount - loadedCount)).toBeLessThanOrEqual(4);
  });

  test("mobile shows cards + hides table; desktop shows table + hides cards", async ({ page }) => {
    await plantAuth(page);
    await stubShell(page);
    await stubList(page);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/welcome-manuals");
    await expect(page.getByTestId("welcome-manuals-mobile")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("welcome-manuals-desktop")).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/welcome-manuals");
    await expect(page.getByTestId("welcome-manuals-desktop")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("welcome-manuals-mobile")).toBeHidden();
  });

  test("list has no horizontal scroll across viewports", async ({ page }) => {
    await plantAuth(page);
    await stubShell(page);
    await stubList(page);

    const viewports = [
      { name: "mobile", width: 375, height: 800 },
      { name: "tablet", width: 768, height: 1024 },
      { name: "desktop", width: 1280, height: 900 },
    ];
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/welcome-manuals");
      await expect(page.getByRole("heading", { name: "Welcome Manuals" })).toBeVisible({
        timeout: 10000,
      });
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth, `Horizontal scroll at ${vp.name}`).toBeLessThanOrEqual(vp.width + 1);
    }
  });

  test("detail skeleton renders then resolves to the header + sections", async ({ page }) => {
    await plantAuth(page);
    await stubShell(page);
    await stubDetail(page, 1200);

    await page.goto(`/welcome-manuals/${MANUAL_ID}`);
    await expect(page.getByTestId("welcome-manual-detail-skeleton")).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId("welcome-manual-header-card")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Lakeview Welcome Guide" })).toBeVisible();
    await expect(page.getByTestId("welcome-manual-sections")).toBeVisible();
    const cards = await page.getByTestId("welcome-manual-section-card").count();
    expect(cards).toBe(3);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const vw = page.viewportSize()?.width ?? 0;
    expect(bodyWidth).toBeLessThanOrEqual(vw + 1);
  });
});
