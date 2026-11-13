/**
 * No-backend E2E for the Discovery page's Dismissed tab. Like the real backend, the stubbed
 * server lists a dismissed posting under Dismissed until undo-dismiss moves it back to the inbox.
 * Covers: opening the tab, the posting with its dismissal reason, Restore's in-flight state and
 * toast, the posting leaving Dismissed and showing in the inbox; a Restore of a posting already
 * restored elsewhere (404) and a Restore the server fails (500); the empty state; the phone layout;
 * and the skeleton matching the loaded cards.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { Page } from "@playwright/test";
import { createGate } from "@platform/ui/test-support/gate";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;
const UNDO_ENDPOINT = /\/api\/discover\/([^/]+)\/undo-dismiss$/;
// The detail the backend's undo-dismiss answers 404 with (`_NOT_FOUND_DETAIL` in app/api/discover.py).
const NOT_FOUND_DETAIL = "Discovery resource not found";
const UNDO_DISMISS_GONE = "This posting can no longer be brought back. It may already be in your inbox.";
const RESTORE_FAILED = "Couldn't restore this posting";
const PHONE = { width: 375, height: 812 };
const MIN_TOUCH_TARGET_PX = 44;

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

function posting(id: string, title: string, dismissedReason: string | null) {
  return {
    id,
    source: "jsearch",
    source_publisher: null,
    source_url: `https://example.com/jobs/${id}`,
    title,
    company_name: "Acme Corp",
    location: "Remote",
    remote_type: "remote",
    description: "Build and run the platform's APIs.",
    posted_at: null,
    discovered_at: "2026-11-01T00:00:00Z",
    salary_min: null,
    salary_max: null,
    salary_currency: "USD",
    salary_period: null,
    score: null,
    score_reason: null,
    scored_at: null,
    dismissed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    dismissed_reason: dismissedReason,
    saved_at: null,
    promoted_application_id: null,
    verdict: null,
    discovery_source_id: "src-1",
  };
}

const BACKEND_ROLE = posting("job-d1", "Backend Engineer", "wrong_stack");

interface StubOptions {
  dismissed?: ReturnType<typeof posting>[];
  /** 404: the posting was already restored on another device. 500: the server fails. */
  refuseRestore?: 404 | 500;
  /** Holds each undo-dismiss until released, so the in-flight Restore can be seen. */
  holdRestore?: Promise<void>;
  /** Holds each Dismissed list read until released, so the skeleton can be measured. */
  holdDismissedList?: Promise<void>;
}

/** Stubs the Discovery reads with a fake server holding which postings are dismissed; returns the restored ids. */
async function stubDiscover(page: Page, options: StubOptions = {}): Promise<string[]> {
  const dismissed = [...(options.dismissed ?? [BACKEND_ROLE])];
  const inbox: ReturnType<typeof posting>[] = [];
  const restoredIds: string[] = [];
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([SOURCE])));
  await page.route(DISCOVER_ENDPOINT, async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state") ?? "inbox";
    if (state === "dismissed" && options.holdDismissedList) await options.holdDismissedList;
    const items = state === "dismissed" ? dismissed : state === "inbox" ? inbox : [];
    const coverage = state === "inbox" ? { scored_count: 0, total_count: items.length } : { scored_count: null, total_count: null };
    return route.fulfill(json({ items, total: items.length, has_more: false, state, ...coverage }));
  });
  await page.route(UNDO_ENDPOINT, async (route) => {
    if (options.holdRestore) await options.holdRestore;
    if (options.refuseRestore === 500) return route.fulfill({ status: 500, body: "" });
    const id = UNDO_ENDPOINT.exec(new URL(route.request().url()).pathname)?.[1] ?? "";
    const index = dismissed.findIndex((job) => job.id === id);
    if (index >= 0) inbox.push({ ...dismissed.splice(index, 1)[0], dismissed_at: null as unknown as string, dismissed_reason: null });
    // Restored on another device a moment ago: the server has moved it, so this tap finds nothing to undo.
    if (options.refuseRestore === 404) return route.fulfill(json({ detail: NOT_FOUND_DETAIL }, 404));
    restoredIds.push(id);
    return route.fulfill({ status: 204 });
  });
  return restoredIds;
}

const restoreButton = (page: Page, title = "Backend Engineer") =>
  page.getByRole("button", { name: `Restore ${title} at Acme Corp` });
const postingTitle = (page: Page, title = "Backend Engineer") => page.getByRole("heading", { name: title });

test("open Dismissed, see the reason, Restore shows it's working, confirms, and the posting returns to the inbox", async ({ page }) => {
  const restore = createGate();
  const restoredIds = await stubDiscover(page, { holdRestore: restore.wait });

  await page.goto("/discover");
  await page.getByRole("tab", { name: "Dismissed" }).click();

  await expect(page).toHaveURL(/[?&]view=dismissed/);
  await expect(page.getByRole("tab", { name: "Dismissed" })).toHaveAttribute("aria-selected", "true");
  await expect(postingTitle(page)).toBeVisible();
  await expect(page.getByTestId("dismissal-summary")).toHaveText("Dismissed 2 days ago · Wrong tech stack");
  await expect(page.getByRole("button", { name: "Dismiss this posting" })).toHaveCount(0);

  await restoreButton(page).click();
  await expect(restoreButton(page)).toBeDisabled();
  await expect(restoreButton(page)).toHaveText("Restoring…");

  restore.release();

  await expect(toast(page, "Posting restored to your inbox")).toBeVisible();
  await expect(postingTitle(page)).toHaveCount(0);
  await expect(page.getByText("No dismissed jobs", { exact: true })).toBeVisible();
  expect(restoredIds).toEqual([BACKEND_ROLE.id]);

  await page.getByRole("tab", { name: "Inbox" }).click();
  await expect(postingTitle(page)).toBeVisible();
});

test("Restore on a posting already restored elsewhere says so in plain words, and its card goes", async ({ page }) => {
  await stubDiscover(page, { refuseRestore: 404 });

  await page.goto("/discover?view=dismissed");
  await restoreButton(page).click();

  await expect(toast(page, UNDO_DISMISS_GONE)).toBeVisible();
  await expect(page.getByText(NOT_FOUND_DETAIL)).toHaveCount(0);
  await expect(postingTitle(page)).toHaveCount(0);
  await expect(page.getByText("No dismissed jobs", { exact: true })).toBeVisible();
});

test("a Restore the server fails says it couldn't, and keeps the posting with Restore ready again", async ({ page }) => {
  await stubDiscover(page, { refuseRestore: 500 });

  await page.goto("/discover?view=dismissed");
  await restoreButton(page).click();

  await expect(toast(page, RESTORE_FAILED)).toBeVisible();
  await expect(postingTitle(page)).toBeVisible();
  await expect(restoreButton(page)).toBeEnabled();
});

test("an empty Dismissed tab explains what shows up there", async ({ page }) => {
  await stubDiscover(page, { dismissed: [] });

  await page.goto("/discover?view=dismissed");

  await expect(page.getByText("No dismissed jobs", { exact: true })).toBeVisible();
  await expect(page.getByText(/Postings you dismiss show up here while they're still open/)).toBeVisible();
});

test("on a phone the three tabs and the dismissed card fit the screen, with full-size touch targets", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await stubDiscover(page);

  await page.goto("/discover?view=dismissed");
  await expect(postingTitle(page)).toBeVisible();

  for (const name of ["Inbox", "Saved", "Dismissed"]) {
    const box = await page.getByRole("tab", { name }).boundingBox();
    expect(box, `${name} tab`).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }
  const restoreBox = await restoreButton(page).boundingBox();
  expect(restoreBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  expect(restoreBox!.x + restoreBox!.width).toBeLessThanOrEqual(PHONE.width);
  const openBox = await page.getByRole("link", { name: "Open" }).boundingBox();
  expect(openBox!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
});

test("the Dismissed skeleton has the loaded list's cards, each ending in the same two actions", async ({ page }) => {
  const list = createGate();
  await stubDiscover(page, {
    dismissed: [posting("job-d1", "Posting one", null), posting("job-d2", "Posting two", "not_remote"), posting("job-d3", "Posting three", "other")],
    holdDismissedList: list.wait,
  });

  await page.goto("/discover?view=dismissed");
  const skeleton = page.getByTestId("discovered-jobs-skeleton");
  await expect(skeleton).toBeVisible();
  const skeletonCards = await skeleton.locator(":scope > *").count();
  const skeletonActions = await skeleton.getByTestId("skeleton-actions").evaluateAll((rows) => rows.map((row) => row.children.length));

  list.release();

  await expect(postingTitle(page, "Posting one")).toBeVisible();
  const loadedActions = await page.getByTestId("dismissed-job-actions").evaluateAll((rows) => rows.map((row) => row.children.length));
  expect(loadedActions.length).toBe(skeletonCards);
  expect(loadedActions).toEqual(skeletonActions);
  await expect(page.getByTestId("dismissal-summary")).toHaveCount(skeletonCards);
});
