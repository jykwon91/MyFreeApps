/**
 * No-backend E2E for connected banks on /financial-accounts.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job. Plaid Link itself (a cross-origin iframe)
 * is out of reach here; the matching dialog and the hook that opens Link are
 * covered by the unit tests.
 *
 * Verifies:
 *   - a connected bank is listed with its account count, and the manual
 *     "Add account" flow is still there;
 *   - Sync now sends the sync and toasts what changed;
 *   - a connection needing a sign-in offers Reconnect, not Sync now;
 *   - Disconnect asks first, then deletes the item and toasts;
 *   - with no connected banks the section is absent;
 *   - the section shows a skeleton while the list is loading.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toast } from "@platform/ui/test-support/toast";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { DESKTOP_VIEWPORT, expectFullWidthPage } from "./fixtures/fullWidthPage";

const ACTIVE_ITEM = {
  id: "11111111-1111-1111-1111-111111111111",
  institution_name: "Chase",
  status: "active",
  error_code: null,
  last_synced_at: null,
  account_count: 2,
  created_at: "2026-11-23T00:00:00Z",
};
const LOGIN_ITEM = {
  ...ACTIVE_ITEM,
  id: "22222222-2222-2222-2222-222222222222",
  institution_name: "TDECU",
  status: "login_required",
  error_code: "ITEM_LOGIN_REQUIRED",
};

interface FakeServer {
  syncs: string[];
  deletes: string[];
}

async function stubApi(page: Page, items: unknown[], { holdList = false } = {}): Promise<FakeServer> {
  const server: FakeServer = { syncs: [], deletes: [] };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/plaid/items", async (route) => {
    if (holdList) return; // never answered: the section stays loading
    await route.fulfill(json(items));
  });
  await page.route("**/api/plaid/items/*/sync", async (route, request: Request) => {
    server.syncs.push(request.url());
    await route.fulfill(json({ added: 3, modified: 0, removed: 1, matched_existing: 0, transfers_matched: 0, status: "active" }));
  });
  await page.route("**/api/plaid/items/*", async (route, request: Request) => {
    if (request.method() !== "DELETE") return route.fallback();
    server.deletes.push(request.url());
    await route.fulfill({ status: 204, body: "" });
  });
  return server;
}

test.describe("Connected banks", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("a connected bank is listed beside the manual flow and syncs on demand", async ({ page }) => {
    const server = await stubApi(page, [ACTIVE_ITEM]);
    await page.goto("/financial-accounts");

    const row = page.getByTestId(`connected-bank-row-${ACTIVE_ITEM.id}`);
    await expect(row).toContainText("Chase");
    await expect(row).toContainText("2 accounts");
    await expect(page.getByTestId("connect-bank-button")).toBeVisible();
    await expect(page.getByTestId("add-financial-account-button")).toBeVisible();

    await row.getByTestId("connected-bank-sync").click();
    await expect(toast(page, "Synced: 3 new, 1 removed.")).toBeVisible();
    expect(server.syncs).toEqual([expect.stringContaining(`/plaid/items/${ACTIVE_ITEM.id}/sync`)]);
  });

  test("a connection needing a sign-in offers Reconnect instead of Sync now", async ({ page }) => {
    await stubApi(page, [LOGIN_ITEM]);
    await page.goto("/financial-accounts");

    const row = page.getByTestId(`connected-bank-row-${LOGIN_ITEM.id}`);
    await expect(row.getByTestId("connected-bank-status")).toHaveText("Your bank wants you to sign in again.");
    await expect(row.getByTestId("connected-bank-reconnect")).toBeVisible();
    await expect(row.getByTestId("connected-bank-sync")).toHaveCount(0);
  });

  test("disconnect asks first, then removes the connection", async ({ page }) => {
    const server = await stubApi(page, [ACTIVE_ITEM]);
    await page.goto("/financial-accounts");

    await page.getByTestId("connected-bank-disconnect").click();
    const dialog = page.getByRole("dialog", { name: "Disconnect this bank?" });
    await expect(dialog).toContainText("They just stop syncing.");
    expect(server.deletes).toEqual([]);

    await dialog.getByRole("button", { name: "Disconnect" }).click();
    await expect(toast(page, "Bank disconnected.")).toBeVisible();
    expect(server.deletes).toEqual([expect.stringContaining(`/plaid/items/${ACTIVE_ITEM.id}`)]);
  });

  test("with no connected banks the section is absent", async ({ page }) => {
    await stubApi(page, []);
    await page.goto("/financial-accounts");
    await expect(page.getByTestId("connect-bank-button")).toBeVisible();
    await expect(page.getByTestId("connected-banks")).toHaveCount(0);
  });

  test("the section shows a skeleton while the list loads", async ({ page }) => {
    await stubApi(page, [], { holdList: true });
    await page.goto("/financial-accounts");
    await expect(page.getByTestId("connected-banks-skeleton")).toBeVisible();
  });

  test("on a desktop screen it uses the full width, with both buttons on the title's row", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await stubApi(page, [ACTIVE_ITEM]);
    await page.goto("/financial-accounts");
    await expect(page.getByTestId(`connected-bank-row-${ACTIVE_ITEM.id}`)).toBeVisible();
    await expectFullWidthPage(page);

    const connect = await page.getByTestId("connect-bank-button").boundingBox();
    const add = await page.getByTestId("add-financial-account-button").boundingBox();
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(Math.abs(connect!.y - add!.y), "the two buttons should share a row").toBeLessThanOrEqual(2);
    expect(add!.x).toBeGreaterThanOrEqual(connect!.x + connect!.width);
    expect(connect!.y, "the buttons should sit on the title's row").toBeLessThan(title!.y + title!.height);
  });

  test("the OAuth return page with no Link session points back to accounts", async ({ page }) => {
    await stubApi(page, []);
    await page.goto("/plaid-oauth?oauth_state_id=abc");
    await expect(page.getByTestId("plaid-oauth-no-session")).toBeVisible();
    await page.getByTestId("plaid-oauth-no-session").getByRole("link", { name: "Back to Financial Accounts" }).click();
    await expect(page).toHaveURL(/\/financial-accounts$/);
  });
});
