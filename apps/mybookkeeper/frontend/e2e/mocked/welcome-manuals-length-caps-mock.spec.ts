/**
 * No-backend E2E: the welcome-manual editor stops typing at the lengths the
 * backend accepts, so an over-length entry can never reach a failing save.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
});

const MANUAL_ID = "00000000-0000-0000-0000-0000000000a1";
const SECTION_ID = "00000000-0000-0000-0000-00000000c001";
const STAMP = "2026-01-01T00:00:00Z";

// Backend caps (app/core/welcome_manual_constants.py).
const TITLE_MAX = 200;
const SECTION_TITLE_MAX = 200;
const FIELD_LABEL_MAX = 100;
const FIELD_VALUE_MAX = 500;
const ROOM_NAME_MAX = 120;
const PLACE_NAME_MAX = 150;
const PLACE_CUISINE_MAX = 50;
const PLACE_NOTE_MAX = 500;

async function stubManual(page: Page): Promise<void> {
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
  );
  await page.route(`**/api/welcome-manuals/${MANUAL_ID}`, async (route, request) => {
    if (request.method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: MANUAL_ID,
        organization_id: ORG_ID,
        user_id: "00000000-0000-0000-0000-000000000001",
        property_id: null,
        title: "Lakeview Welcome Guide",
        intro_text: null,
        rooms: [
          { id: "00000000-0000-0000-0000-0000000000d1", manual_id: MANUAL_ID, name: "Front room", display_order: 0, created_at: STAMP, updated_at: STAMP },
        ],
        sections: [
          {
            id: SECTION_ID,
            manual_id: MANUAL_ID,
            title: "Wi-Fi",
            body: "Instructions",
            display_order: 0,
            room_id: null,
            fields: [
              { id: "00000000-0000-0000-0000-0000000000f1", section_id: SECTION_ID, label: "Network", value: "Lakeview", display_order: 0, created_at: STAMP },
            ],
            images: [],
            created_at: STAMP,
            updated_at: STAMP,
          },
        ],
        places: [
          { id: "00000000-0000-0000-0000-0000000000e1", manual_id: MANUAL_ID, name: "Taco Spot", cuisine: "Mexican", price_tier: "$", note: null, map_url: null, display_order: 0, created_at: STAMP },
        ],
        share_token: null,
        share_pin: null,
        created_at: STAMP,
        updated_at: STAMP,
      }),
    });
  });
}

async function typeOverLimit(page: Page, testId: string, max: number): Promise<void> {
  const input = page.getByTestId(testId).first();
  await input.fill("x".repeat(max + 50));
  await expect(input).toHaveValue("x".repeat(max));
}

test.describe("Welcome manual editor length caps (mocked, no backend)", () => {
  test("inputs stop at the backend's limits", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await plantAuth(page);
    await stubManual(page);

    await page.goto(`/welcome-manuals/${MANUAL_ID}`);
    await expect(page.getByTestId("welcome-manual-header-card")).toBeVisible({ timeout: 10000 });

    await typeOverLimit(page, "welcome-manual-section-title", SECTION_TITLE_MAX);
    await typeOverLimit(page, "welcome-manual-field-label", FIELD_LABEL_MAX);
    await typeOverLimit(page, "welcome-manual-field-value", FIELD_VALUE_MAX);
    await typeOverLimit(page, "welcome-manual-room-name", ROOM_NAME_MAX);
    await typeOverLimit(page, "welcome-manual-place-name", PLACE_NAME_MAX);
    await typeOverLimit(page, "welcome-manual-place-cuisine", PLACE_CUISINE_MAX);
    await typeOverLimit(page, "welcome-manual-place-note", PLACE_NOTE_MAX);
  });

  test("the edit-details title stops at the backend's limit", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await plantAuth(page);
    await stubManual(page);

    await page.goto(`/welcome-manuals/${MANUAL_ID}`);
    await expect(page.getByTestId("welcome-manual-header-card")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("edit-welcome-manual-button").click();
    await typeOverLimit(page, "welcome-manual-edit-title", TITLE_MAX);
  });
});
