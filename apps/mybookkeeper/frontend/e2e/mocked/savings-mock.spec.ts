/**
 * No-backend E2E for /savings.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - the page is in the nav, after Budget;
 *   - with research off it says the spending summary goes to Anthropic, and turning it on shows the page;
 *   - "Research now" starts a run, the page polls while it runs, and the new ideas show when it ends;
 *   - the daily limit's refusal shows the server's reason;
 *   - an idea opens to its steps and sources, and Done takes it off the list;
 *   - the category filter is in the URL and replaces the history entry;
 *   - the skeleton has the loaded page's shape;
 *   - on a phone the page doesn't scroll sideways, with an idea open.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toast } from "@platform/ui/test-support/toast";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { DESKTOP_VIEWPORT, expectFullWidthPage } from "./fixtures/fullWidthPage";

const CARD = "11111111-1111-1111-1111-111111111111";
const HULU = "22222222-2222-2222-2222-222222222222";
const NEW_IDEA = "33333333-3333-3333-3333-333333333333";

function idea(id: string, category: string, title: string, low: number, high: number) {
  return {
    id, category, title, savings_low_cents: low, savings_high_cents: high, effort: "low",
    why_it_fits: "It matches what you spend.", steps: ["Step one", "Step two"],
    source_urls: ["https://www.example-bank.com/offer"], card_details: null, expires_on: null,
    status: "open", last_confirmed_at: "2026-11-27T12:00:00Z",
  };
}

interface FakeServer {
  enabled: boolean;
  running: boolean;
  overviewReads: number;
  statusUpdates: unknown[];
  limitReached: boolean;
}

function overview(server: FakeServer, ideas: ReturnType<typeof idea>[]) {
  const low = ideas.reduce((sum, i) => sum + i.savings_low_cents, 0);
  const high = ideas.reduce((sum, i) => sum + i.savings_high_cents, 0);
  return {
    research_enabled: server.enabled, total_savings_low_cents: low, total_savings_high_cents: high,
    last_researched_at: "2026-11-27T12:00:00Z", next_research_due_at: server.running ? null : "2026-11-28T12:00:00Z",
    run_in_progress: server.running, latest_run: null, manual_runs_left: 2, manual_run_limit: 3,
    next_manual_run_at: null, ideas: server.enabled ? ideas : [],
  };
}

async function stubApi(
  page: Page,
  { enabled = true, hold = false, limitReached = false } = {},
): Promise<FakeServer> {
  const server: FakeServer = { enabled, running: false, overviewReads: 0, statusUpdates: [], limitReached };
  let ideas = [
    idea(CARD, "credit_card", "Open a travel card", 75_000, 90_000),
    idea(HULU, "subscription", "Cancel Hulu", 12_000, 12_000),
  ];
  let readsWhileRunning = 0;
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/savings(\?.*)?$/, async (route) => {
    if (hold) return; // never answered: the page stays loading
    server.overviewReads += 1;
    if (server.running) {
      readsWhileRunning += 1;
      if (readsWhileRunning >= 2) {
        server.running = false;
        ideas = [idea(NEW_IDEA, "bank_bonus", "Open a checking bonus", 30_000, 30_000), ...ideas];
      }
    }
    await route.fulfill(json(overview(server, ideas)));
  });
  await page.route(/\/api\/savings\/settings$/, async (route, request: Request) => {
    server.enabled = (request.postDataJSON() as { enabled: boolean }).enabled;
    await route.fulfill(json(overview(server, ideas)));
  });
  await page.route(/\/api\/savings\/research$/, async (route) => {
    if (server.limitReached) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: { "Retry-After": "3600" },
        body: JSON.stringify({ detail: "You've used all 3 research runs for today. Try again later." }),
      });
      return;
    }
    server.running = true;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ run_id: "r1" }) });
  });
  await page.route(/\/api\/savings\/ideas\/[^/?]+$/, async (route, request: Request) => {
    const id = new URL(request.url()).pathname.split("/").pop() ?? "";
    const body = request.postDataJSON() as { status: string };
    server.statusUpdates.push({ id, ...body });
    const updated = ideas.find((i) => i.id === id);
    ideas = ideas.filter((i) => i.id !== id);
    await route.fulfill(json({ ...updated, status: body.status }));
  });
  return server;
}

async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Savings", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("is in the nav and lists ideas biggest saving first", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.getByRole("link", { name: "Savings" }).first().click();
    await expect(page).toHaveURL(/\/savings$/);
    await expect(page.getByTestId("savings-total")).toContainText("$870–$1,020");
    await expect(page.getByTestId("savings-idea-amount")).toHaveText(["$750–$900", "$120"]);
    await expect(page.getByTestId("savings-disclaimer")).toBeVisible();
  });

  test("with research off it says what goes to Anthropic, and turning it on shows the page", async ({ page }) => {
    await stubApi(page, { enabled: false });
    await page.goto("/savings");
    const off = page.getByTestId("savings-off");
    await expect(off).toContainText("sent to Anthropic");
    await expect(off).toContainText("No account numbers");
    await page.getByTestId("savings-turn-on").click();
    await expect(toast(page, "Daily research is on. The first run is starting.")).toBeVisible();
    await expect(page.getByTestId(`savings-idea-${CARD}`)).toBeVisible();
  });

  test("Research now runs in the background, the page polls, and new ideas appear", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/savings");
    await page.getByTestId("savings-research-now").click();
    await expect(toast(page, "Researching — this takes a few minutes. You can leave this page.")).toBeVisible();
    await expect(page.getByTestId("savings-running")).toBeVisible();
    await expect(page.getByTestId("savings-research-now")).toBeDisabled();
    await expect(page.getByTestId(`savings-idea-${NEW_IDEA}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("savings-running")).toHaveCount(0);
    expect(server.overviewReads).toBeGreaterThanOrEqual(3);
  });

  test("the daily limit's refusal shows the server's reason", async ({ page }) => {
    await stubApi(page, { limitReached: true });
    await page.goto("/savings");
    await page.getByTestId("savings-research-now").click();
    await expect(toast(page, "You've used all 3 research runs for today. Try again later.")).toBeVisible();
  });

  test("an idea opens to its steps and sources, and Done takes it off the list", async ({ page }) => {
    const server = await stubApi(page);
    await page.goto("/savings");
    const hulu = page.getByTestId(`savings-idea-${HULU}`);
    await hulu.getByTestId("savings-idea-toggle").click();
    await expect(hulu.getByTestId("savings-idea-steps").getByRole("listitem")).toHaveCount(2);
    await expect(hulu.getByTestId("savings-idea-sources").getByRole("link", { name: "example-bank.com" })).toBeVisible();
    await hulu.getByTestId("savings-idea-done").click();
    await expect(toast(page, "Marked done. Nice saving!")).toBeVisible();
    expect(server.statusUpdates).toEqual([{ id: HULU, status: "done" }]);
    await expect(hulu).toHaveCount(0);
  });

  test("the category filter is in the URL and replaces the history entry", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await page.goto("/savings");
    await page.getByTestId("savings-filter-subscription").click();
    await expect(page).toHaveURL(/\/savings\?category=subscription$/);
    await expect(page.getByTestId(`savings-idea-${CARD}`)).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("savings-filter-subscription")).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(page).not.toHaveURL(/\/savings/);
  });

  test("the skeleton has the loaded page's shape", async ({ page }) => {
    await stubApi(page, { hold: true });
    await page.goto("/savings");
    await expect(page.getByTestId("savings-skeleton")).toBeVisible();
    await expect(page.getByTestId("savings-skeleton-tile")).toHaveCount(3);
    await expect(page.getByTestId("savings-skeleton-row")).not.toHaveCount(0);
  });

  test("uses the full width on a desktop screen", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await stubApi(page);
    await page.goto("/savings");
    await expect(page.getByTestId(`savings-idea-${CARD}`)).toBeVisible();
    await expectFullWidthPage(page);
  });

  test("fits a phone screen, with an idea open", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await stubApi(page);
    await page.goto("/savings");
    await page.getByTestId(`savings-idea-${CARD}`).getByTestId("savings-idea-toggle").click();
    await expect(page.getByTestId("savings-idea-details")).toBeVisible();
    await expectNoSideScroll(page);
  });
});
