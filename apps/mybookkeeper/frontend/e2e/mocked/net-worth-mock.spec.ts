/**
 * No-backend E2E for /net-worth.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - the page is reachable from the nav, next to Financial Accounts;
 *   - the total, both sides and each group are shown, with a stale balance
 *     flagged and linked to where it is updated;
 *   - typing a property's value sends it in cents, toasts, and the page
 *     refetches the new total;
 *   - picking a range asks the server for that range;
 *   - with nothing to count it invites adding an account;
 *   - the skeleton has the loaded page's shape (three tiles, a chart card);
 *   - on a phone the page and the open value editor never scroll sideways.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toast } from "@platform/ui/test-support/toast";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const HOUSE_ID = "33333333-3333-3333-3333-333333333333";

function netWorth(houseCents: number | null) {
  const assets = 250_000 + (houseCents ?? 0);
  return {
    currency: "USD",
    as_of: "2026-11-24",
    assets_cents: assets,
    liabilities_cents: 100_000,
    net_cents: assets - 100_000,
    groups: [
      {
        key: "cash", classification: "asset", total_cents: 250_000,
        lines: [{
          source: "account", id: "a1", name: "Chase Checking", detail: "Chase", amount_cents: 250_000,
          currency: "USD", as_of: "2026-11-24", is_stale: false, in_total: true,
        }],
      },
      {
        key: "property", classification: "asset", total_cents: houseCents ?? 0,
        lines: [{
          source: "property", id: HOUSE_ID, name: "Elm St", detail: "1 Elm St", amount_cents: houseCents,
          currency: "USD", as_of: houseCents === null ? null : "2026-11-24", is_stale: false, in_total: houseCents !== null,
        }],
      },
      {
        key: "credit_cards", classification: "liability", total_cents: 100_000,
        lines: [{
          source: "account", id: "c1", name: "Sapphire", detail: "Chase", amount_cents: 100_000,
          currency: "USD", as_of: "2026-08-01", is_stale: true, in_total: true,
        }],
      },
    ],
  };
}

const HISTORY_POINTS = [
  { day: "2026-11-22", assets_cents: 240_000, liabilities_cents: 100_000, net_cents: 140_000 },
  { day: "2026-11-23", assets_cents: 245_000, liabilities_cents: 100_000, net_cents: 145_000 },
  { day: "2026-11-24", assets_cents: 250_000, liabilities_cents: 100_000, net_cents: 150_000 },
];

interface FakeServer {
  ranges: string[];
  values: unknown[];
}

async function stubApi(page: Page, { empty = false, hold = false } = {}): Promise<FakeServer> {
  const server: FakeServer = { ranges: [], values: [] };
  let houseCents: number | null = null;
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/net-worth", async (route) => {
    if (hold) return; // never answered: the page stays loading
    await route.fulfill(json(empty ? { ...netWorth(null), groups: [], assets_cents: 0, liabilities_cents: 0, net_cents: 0 } : netWorth(houseCents)));
  });
  await page.route("**/api/net-worth/history**", async (route, request: Request) => {
    server.ranges.push(new URL(request.url()).searchParams.get("range") ?? "");
    await route.fulfill(json({ range: "3m", currency: "USD", points: HISTORY_POINTS }));
  });
  await page.route(`**/api/properties/${HOUSE_ID}/estimated-value`, async (route, request: Request) => {
    const body = request.postDataJSON() as { estimated_value_cents: number | null };
    server.values.push(body);
    houseCents = body.estimated_value_cents;
    await route.fulfill(json({ property_id: HOUSE_ID, estimated_value_cents: houseCents, estimated_value_as_of: "2026-11-24" }));
  });
  return server;
}

test.describe("Net worth", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and shows the total, both sides and each group", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Net Worth" }).first().click();
    await expect(page).toHaveURL(/\/net-worth$/);

    await expect(page.getByTestId("net-worth-total")).toContainText("$1,500.00");
    await expect(page.getByTestId("net-worth-assets")).toContainText("$2,500.00");
    await expect(page.getByTestId("net-worth-liabilities")).toContainText("$1,000.00");
    await expect(page.getByTestId("net-worth-group-cash")).toContainText("Chase Checking");
    await expect(page.getByTestId("net-worth-chart")).toBeVisible();

    const card = page.getByTestId("net-worth-line-c1");
    await expect(card).toContainText("Last updated Aug 1, 2026");
    await expect(card.getByTestId("net-worth-update-link")).toHaveAttribute("href", "/financial-accounts");
  });

  test("a property's value is typed in place, saved in cents, and counted", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/net-worth");

    const house = page.getByTestId(`net-worth-line-${HOUSE_ID}`);
    await expect(house).toContainText("No value yet");
    await house.getByTestId("net-worth-edit-value").click();
    await house.getByTestId("property-value-input").fill("400,000");
    await house.getByTestId("property-value-save").click();

    await expect(toast(page, "Property value saved.")).toBeVisible();
    expect(server.values).toEqual([{ estimated_value_cents: 40_000_000 }]);
    await expect(house.getByTestId("net-worth-line-amount")).toContainText("$400,000.00");
    await expect(page.getByTestId("net-worth-total")).toContainText("$401,500.00");
  });

  test("picking a range asks for that range", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/net-worth");
    await expect(page.getByTestId("net-worth-chart")).toBeVisible();
    await page.getByTestId("net-worth-range-1y").click();
    await expect(page.getByTestId("net-worth-range-1y")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => server.ranges).toEqual(["3m", "1y"]);
  });

  test("with nothing to count it invites adding an account", async ({ page }) => {
    await stubApi(page, { empty: true });
    await page.goto("/net-worth");
    await page.getByRole("button", { name: "Add an account" }).click();
    await expect(page).toHaveURL(/\/financial-accounts$/);
  });

  test("the skeleton has the loaded page's shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/net-worth");
    await expect(page.getByTestId("net-worth-skeleton")).toBeVisible();
    await expect(page.getByTestId("net-worth-skeleton-tile")).toHaveCount(3);
    await expect(page.getByTestId("net-worth-skeleton-history")).toHaveCount(1);
    await expect(page.getByTestId("net-worth-skeleton-group")).not.toHaveCount(0);
  });

  test("fits a phone screen, with the value editor open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/net-worth");
    await expect(page.getByTestId("net-worth-chart")).toBeVisible();
    await page.getByTestId(`net-worth-line-${HOUSE_ID}`).getByTestId("net-worth-edit-value").click();
    await expect(page.getByTestId("property-value-input")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
