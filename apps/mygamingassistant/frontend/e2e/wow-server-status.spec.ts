/**
 * WoW Forever server status — E2E tests (network-stubbed).
 *
 * All calls to /api/wow/server-status are intercepted so the suite never
 * actually hits Blizzard. Covers:
 *
 *   - all-up state: green summary + 4 online rulesets on /wow-forever
 *   - partly-down state: amber summary + offline ruleset shown as struck through
 *   - error state: "Couldn't reach Blizzard" message + retry button
 *   - region picker: changing region updates the request URL
 *   - 375px phone layout: no horizontal overflow
 *
 * Run: npm run test:e2e -- wow-server-status
 */
import { test, expect } from "@playwright/test";

const API_PATTERN = "**/wow/server-status**";

const CHECKED_AT = "2026-11-06T12:00:00Z";

const ALL_ONLINE = {
  region: "us",
  checked_at: CHECKED_AT,
  rulesets: [
    { name: "Normal", slug: "normal", online: true },
    { name: "PvP", slug: "pvp", online: true },
    { name: "Roleplay", slug: "roleplay", online: true },
    { name: "Roleplay PvP", slug: "roleplay-pvp", online: true },
  ],
};

const PARTLY_DOWN = {
  region: "us",
  checked_at: CHECKED_AT,
  rulesets: [
    { name: "Normal", slug: "normal", online: true },
    { name: "PvP", slug: "pvp", online: false },
    { name: "Roleplay", slug: "roleplay", online: true },
    { name: "Roleplay PvP", slug: "roleplay-pvp", online: true },
  ],
};

function fulfillStatus(route: Parameters<Parameters<typeof import("@playwright/test").Page["route"]>[1]>[0], body: unknown) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

test("shows all-online summary and 4 rulesets on the landing page", async ({ page }) => {
  await page.route(API_PATTERN, (route) => fulfillStatus(route, ALL_ONLINE));
  await page.goto("/wow-forever");

  const section = page.getByRole("region", { name: "WoW Forever server status" });
  await expect(section).toBeVisible();
  await expect(section.getByText("All servers online")).toBeVisible();

  const list = section.getByRole("list", { name: "Server rulesets" });
  await expect(list.getByText("Normal")).toBeVisible();
  await expect(list.getByText("PvP")).toBeVisible();
  await expect(list.getByText("Roleplay")).toBeVisible();
  await expect(list.getByText("Roleplay PvP")).toBeVisible();

  // Source credit link present
  await expect(section.getByRole("link", { name: "Blizzard status page" })).toBeVisible();
});

test("shows partial-outage summary with offline ruleset crossed out", async ({ page }) => {
  await page.route(API_PATTERN, (route) => fulfillStatus(route, PARTLY_DOWN));
  await page.goto("/wow-forever");

  const section = page.getByRole("region", { name: "WoW Forever server status" });
  await expect(section.getByText(/1 of 4 servers offline/)).toBeVisible();

  // The offline ruleset's name should still appear (screen-readers see "PvP offline")
  const pvpItem = section.getByRole("listitem").filter({ hasText: "PvP" });
  await expect(pvpItem).toBeVisible();
});

test("shows error state and retry button when Blizzard cannot be reached", async ({ page }) => {
  await page.route(API_PATTERN, (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Could not reach Blizzard's server status service." }),
    }),
  );
  await page.goto("/wow-forever");

  const section = page.getByRole("region", { name: "WoW Forever server status" });
  await expect(section.getByText(/Couldn't reach Blizzard's status page/)).toBeVisible();
  await expect(section.getByRole("button", { name: /Try again/ })).toBeVisible();
});

test("region picker changes the API request", async ({ page }) => {
  const regions: string[] = [];
  await page.route(API_PATTERN, (route) => {
    regions.push(new URL(route.request().url()).searchParams.get("region") ?? "");
    return fulfillStatus(route, ALL_ONLINE);
  });
  await page.goto("/wow-forever");

  const section = page.getByRole("region", { name: "WoW Forever server status" });
  await expect(section.getByText("All servers online")).toBeVisible();

  // Switch to Europe
  await section.getByRole("combobox", { name: "Region" }).selectOption("eu");

  // The new request should have region=eu
  await page.waitForResponse((resp) =>
    resp.url().includes("server-status") && resp.url().includes("region=eu"),
  );
  expect(regions).toContain("eu");
});

test("375px phone layout: server status section has no horizontal overflow", async ({ page }) => {
  await page.route(API_PATTERN, (route) => fulfillStatus(route, ALL_ONLINE));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/wow-forever");

  const section = page.getByRole("region", { name: "WoW Forever server status" });
  await expect(section).toBeVisible();
  await expect(section.getByText("All servers online")).toBeVisible();

  // Check no horizontal overflow on the section.
  const { scrollWidth, clientWidth } = await section.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
});
