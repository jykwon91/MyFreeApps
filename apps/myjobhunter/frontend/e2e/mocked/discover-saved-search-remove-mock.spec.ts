/**
 * No-backend E2E for the saved searches on the Discovery page: Remove asks first (Keep leaves the
 * saved search, Remove deletes it), and the inbox never claims there are no saved searches while
 * they are still loading or when they failed to load.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { Page } from "@playwright/test";
import { createGate } from "@platform/ui/test-support/gate";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;
const SOURCE_ENDPOINT = /\/api\/discover\/sources\/[^/]+$/;
const NO_SAVED_SEARCHES = "No saved searches yet";

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

interface StubOptions {
  /** Holds the saved searches read until released, so the loading state can be seen. */
  holdSources?: Promise<void>;
  /** Answers the first saved searches read with a 500; later reads succeed. */
  failFirstSourcesRead?: boolean;
}

/** Stubs the Discovery reads with a fake server holding the saved searches; returns the removed ids. */
async function stubDiscover(page: Page, options: StubOptions = {}): Promise<string[]> {
  const sources = [SOURCE];
  const removedIds: string[] = [];
  let sourcesReads = 0;
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, async (route) => {
    sourcesReads += 1;
    if (options.holdSources) await options.holdSources;
    if (options.failFirstSourcesRead && sourcesReads === 1) return route.fulfill({ status: 500, body: "" });
    return route.fulfill(json(sources));
  });
  await page.route(SOURCE_ENDPOINT, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    const id = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    sources.splice(0, sources.length, ...sources.filter((source) => source.id !== id));
    removedIds.push(id);
    return route.fulfill({ status: 204 });
  });
  await page.route(DISCOVER_ENDPOINT, (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false, state: "inbox", scored_count: 0, total_count: 0 })),
  );
  return removedIds;
}

const removeButton = (page: Page) => page.getByRole("button", { name: "Remove saved search" });
const dialog = (page: Page) => page.getByRole("alertdialog").or(page.getByRole("dialog"));

test("Remove asks first, Keep leaves the saved search, and confirming removes it", async ({ page }) => {
  const removedIds = await stubDiscover(page);

  await page.goto("/discover");
  await expect(page.getByText("Backend roles").first()).toBeVisible();

  await removeButton(page).click();
  await expect(dialog(page).getByText("Remove this saved search?")).toBeVisible();
  await expect(dialog(page).getByText(/It stops fetching new postings\. The postings it already found stay\./)).toBeVisible();
  expect(removedIds).toEqual([]);

  await dialog(page).getByRole("button", { name: "Keep" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText("Backend roles").first()).toBeVisible();
  expect(removedIds).toEqual([]);

  await removeButton(page).click();
  await dialog(page).getByRole("button", { name: "Remove", exact: true }).click();

  await expect(toast(page, "Saved search removed")).toBeVisible();
  await expect(page.getByText("Backend roles")).toHaveCount(0);
  expect(removedIds).toEqual(["src-1"]);
});

test("while the saved searches load the inbox shows a skeleton, not 'No saved searches yet'", async ({ page }) => {
  const sources = createGate();
  await stubDiscover(page, { holdSources: sources.wait });

  await page.goto("/discover");
  await expect(page.getByLabel("Loading saved searches…").first()).toBeVisible();
  await expect(page.getByText(NO_SAVED_SEARCHES)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create a saved search" })).toHaveCount(0);

  sources.release();

  await expect(page.getByText("Backend roles").first()).toBeVisible();
  await expect(page.getByText(NO_SAVED_SEARCHES)).toHaveCount(0);
});

test("when the saved searches fail to load the inbox doesn't call them empty, and Try again recovers", async ({ page }) => {
  await stubDiscover(page, { failFirstSourcesRead: true });

  await page.goto("/discover");
  await expect(page.getByText("Couldn't load saved searches.")).toBeVisible();
  await expect(page.getByText(NO_SAVED_SEARCHES)).toHaveCount(0);

  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText("Backend roles").first()).toBeVisible();
  await expect(page.getByText("Couldn't load saved searches.")).toHaveCount(0);
});
