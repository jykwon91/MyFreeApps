/**
 * No-backend E2E for undoing a dismissal in the Discovery inbox. Like the real
 * backend, the stubbed inbox leaves a dismissed posting out, so its card
 * unmounts at once; the "Dismissed." toast must outlive it. Undo restores the
 * posting through undo-dismiss; letting the toast expire keeps it dismissed; a
 * refused Undo says why.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;
const JOB_ID = "job-undo-1";
const JOB_ACTION = new RegExp(`/api/discover/${JOB_ID}/(dismiss|undo-dismiss)$`);

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

const POSTING = {
  id: JOB_ID,
  source: "jsearch",
  source_publisher: null,
  source_url: null,
  title: "Backend Engineer",
  company_name: "Acme Corp",
  location: "Remote",
  remote_type: "remote",
  description: null,
  posted_at: null,
  discovered_at: "2026-11-01T00:00:00Z",
  salary_min: null,
  salary_max: null,
  salary_currency: "USD",
  salary_period: null,
  score: null,
  score_reason: null,
  scored_at: null,
  dismissed_at: null,
  dismissed_reason: null,
  saved_at: null,
  promoted_application_id: null,
  verdict: null,
  discovery_source_id: "src-1",
};

// Past the shared Toaster's 6s auto-close delay.
const TOAST_EXPIRY_MS = 6_500;
// The detail the backend's undo-dismiss answers 404 with (`_NOT_FOUND_DETAIL` in app/api/discover.py).
const NOT_FOUND_DETAIL = "Discovery resource not found";

/** Stubs the inbox with one posting and records each dismiss / undo-dismiss call. */
async function stubInbox(page: Page, { refuseUndo = false }: { refuseUndo?: boolean } = {}): Promise<string[]> {
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([SOURCE])));
  let dismissed = false;
  const actions: string[] = [];
  await page.route(DISCOVER_ENDPOINT, (route) => {
    const items = dismissed ? [] : [POSTING];
    return route.fulfill(
      json({ items, total: items.length, has_more: false, state: "inbox", scored_count: 0, total_count: items.length }),
    );
  });
  await page.route(JOB_ACTION, (route) => {
    const action = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    actions.push(action);
    if (action === "undo-dismiss" && refuseUndo) {
      return route.fulfill(json({ detail: NOT_FOUND_DETAIL }, 404));
    }
    dismissed = action === "dismiss";
    return route.fulfill({ status: 204 });
  });
  return actions;
}

async function dismissThePosting(page: Page): Promise<void> {
  await page.goto("/discover");
  await page.getByRole("button", { name: "Dismiss this posting" }).click();
  await page.getByRole("button", { name: "Skip — dismiss without a reason" }).click();
}

const postingTitle = (page: Page) => page.getByRole("heading", { name: "Backend Engineer" });
const dismissedToast = (page: Page) => toast(page, "Dismissed.");

test("the Undo toast outlives the dismissed card, and Undo restores the posting", async ({ page }) => {
  const actions = await stubInbox(page);
  await dismissThePosting(page);

  await expect(dismissedToast(page)).toBeVisible();
  await expect(postingTitle(page)).toHaveCount(0);
  // Playwright refuses a click on an element with pointer-events: none.
  await page.getByRole("button", { name: "Undo" }).click();

  await expect.poll(() => actions).toEqual(["dismiss", "undo-dismiss"]);
  await expect(dismissedToast(page)).toHaveCount(0);
  await expect(toast(page, "Posting brought back")).toBeVisible();
  await expect(postingTitle(page)).toBeVisible();
});

test("ignoring the Undo toast lets the dismissal stand", async ({ page }) => {
  await page.clock.install();
  const actions = await stubInbox(page);
  await dismissThePosting(page);

  await expect(dismissedToast(page)).toBeVisible();
  await page.clock.runFor(TOAST_EXPIRY_MS);
  await expect(dismissedToast(page)).toHaveCount(0);
  await expect(postingTitle(page)).toHaveCount(0);
  expect(actions).toEqual(["dismiss"]);
});

test("a refused Undo shows the server's reason, and the posting stays dismissed", async ({ page }) => {
  const actions = await stubInbox(page, { refuseUndo: true });
  await dismissThePosting(page);

  await expect(dismissedToast(page)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect(toast(page, NOT_FOUND_DETAIL)).toBeVisible();
  await expect(dismissedToast(page)).toHaveCount(0);
  await expect(postingTitle(page)).toHaveCount(0);
  expect(actions).toEqual(["dismiss", "undo-dismiss"]);
});
