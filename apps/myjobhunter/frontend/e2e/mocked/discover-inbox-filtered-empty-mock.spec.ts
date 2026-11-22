/**
 * No-backend E2E for the Discovery inbox's empty states: with a saved search chosen the inbox says
 * nothing came from that search and offers every saved search again, as Saved and Dismissed do.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;

const SOURCE = {
  id: "src-1",
  source: "jsearch",
  name: "Backend roles",
  config: { roles: ["Backend Engineer"] },
  is_active: true,
  fetch_interval_minutes: 1440,
  last_fetched_at: null,
  last_success_at: null,
  last_error_at: null,
  last_error_message: null,
  consecutive_failures: 0,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

test("an empty inbox filtered to one saved search offers every saved search again", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([SOURCE])));
  await page.route(DISCOVER_ENDPOINT, (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false, state: "inbox", scored_count: 0, total_count: 0 })),
  );

  await page.goto(`/discover?source=${SOURCE.id}`);
  await expect(page.getByText("Inbox empty for this search", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Show every saved search" }).click();

  await expect(page.getByText("Inbox empty", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show every saved search" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]source=/);
});
