/**
 * No-backend E2E for the Discovery page's view tabs as a keyboard and screen-reader user meets them:
 * a named tablist, one tab in the tab order, the arrow keys (wrapping) and Home/End moving between
 * views and switching the list, and the panel named by whichever tab is active.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;
const VIEWS = ["Inbox", "Saved", "Dismissed"] as const;

/** Stubs an empty Discovery for every view and records which views were fetched. */
async function stubDiscover(page: Page): Promise<string[]> {
  const fetched: string[] = [];
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([])));
  await page.route(DISCOVER_ENDPOINT, (route) => {
    const state = new URL(route.request().url()).searchParams.get("state") ?? "inbox";
    fetched.push(state);
    const coverage = state === "inbox" ? { scored_count: 0, total_count: 0 } : { scored_count: null, total_count: null };
    return route.fulfill(json({ items: [], total: 0, has_more: false, state, ...coverage }));
  });
  return fetched;
}

const tab = (page: Page, name: (typeof VIEWS)[number]) => page.getByRole("tab", { name });

/** The inbox is the default view, so its URL carries no `view` param. */
async function expectActive(page: Page, name: (typeof VIEWS)[number], view: string | null): Promise<void> {
  await expect(tab(page, name)).toBeFocused();
  await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
  if (view) await expect(page).toHaveURL(new RegExp(`[?&]view=${view}`));
  else await expect(page).not.toHaveURL(/[?&]view=/);
  const tabId = await tab(page, name).getAttribute("id");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", tabId ?? "");
}

test("the tabs are a named tablist with only the active tab in the tab order, each pointing at the panel", async ({ page }) => {
  await stubDiscover(page);
  await page.goto("/discover");

  await expect(page.getByRole("tablist", { name: "Discovery views" })).toBeVisible();
  const panelId = await page.getByRole("tabpanel").getAttribute("id");
  for (const name of VIEWS) {
    await expect(tab(page, name)).toHaveAttribute("aria-controls", panelId ?? "");
    await expect(tab(page, name)).toHaveAttribute("tabindex", name === "Inbox" ? "0" : "-1");
  }
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", (await tab(page, "Inbox").getAttribute("id")) ?? "");
});

test("arrow keys wrap between views and Home/End jump to the ends, switching the list each time", async ({ page }) => {
  const fetched = await stubDiscover(page);
  await page.goto("/discover");
  await tab(page, "Inbox").focus();

  await page.keyboard.press("ArrowRight");
  await expectActive(page, "Saved", "saved");
  await expect(tab(page, "Inbox")).toHaveAttribute("tabindex", "-1");
  await expect(tab(page, "Saved")).toHaveAttribute("tabindex", "0");

  await page.keyboard.press("End");
  await expectActive(page, "Dismissed", "dismissed");

  await page.keyboard.press("ArrowRight");
  await expectActive(page, "Inbox", null);

  await page.keyboard.press("ArrowLeft");
  await expectActive(page, "Dismissed", "dismissed");

  await page.keyboard.press("Home");
  await expectActive(page, "Inbox", null);

  expect(fetched).toEqual(expect.arrayContaining(["saved", "dismissed"]));
});

test("Tab leaves the tablist from the active tab instead of stepping through every tab", async ({ page }) => {
  await stubDiscover(page);
  await page.goto("/discover?view=saved");
  await tab(page, "Saved").focus();

  await page.keyboard.press("Tab");

  for (const name of VIEWS) await expect(tab(page, name)).not.toBeFocused();
});
