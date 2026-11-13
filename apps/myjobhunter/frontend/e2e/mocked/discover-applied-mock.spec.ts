/**
 * No-backend E2E for a Discover posting already turned into an application. Like the real backend,
 * the stubbed server lists an applied posting in no Discover view and answers a coded 409 to Dismiss
 * or Save on it. Covers: Dismiss and Save on a stale card (applied on another device) saying so in
 * plain words while the card goes; and Apply keeping Save and Dismiss off from the click, and gone
 * once it succeeds, until the card leaves.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import type { Page } from "@playwright/test";
import { createGate } from "@platform/ui/test-support/gate";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;
const JOB_ID = "job-applied-1";
const JOB_ACTION = new RegExp(`/api/discover/${JOB_ID}/(dismiss|save|promote)$`);
// The detail the backend's dismiss / save answer 409 with (app/core/discovered_job_conflicts.py).
// Literals, not the api-client constants: Playwright loads that package as CommonJS, without named exports.
const ALREADY_APPLIED_DETAIL = { code: "DISCOVERED_JOB_ALREADY_APPLIED", message: "This posting is already in your Applications" };
// ALREADY_APPLIED and .promoted.
const ALREADY_APPLIED = "This posting is already in your Applications.";
const PROMOTED = "Added to Applications";

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

interface StubOptions {
  /** Already added to Applications on another device; this page's first read still lists it. */
  appliedElsewhere?: boolean;
  /** Holds each promote until released, so the in-flight Apply can be seen. */
  holdPromote?: Promise<void>;
  /** Holds the list reads after Apply until released, so the applied card can be seen before it leaves. */
  holdRefetch?: Promise<void>;
}

/** Stubs the inbox with one posting and a fake server knowing whether it's applied; returns each action called. */
async function stubInbox(page: Page, options: StubOptions = {}): Promise<string[]> {
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([SOURCE])));
  let applied = false;
  let reads = 0;
  const actions: string[] = [];
  await page.route(DISCOVER_ENDPOINT, async (route) => {
    reads += 1;
    // The stale first read: the page loaded before the other device's Apply reached it.
    if (options.appliedElsewhere && reads > 1) applied = true;
    if (applied && options.holdRefetch) await options.holdRefetch;
    const items = applied ? [] : [POSTING];
    return route.fulfill(
      json({ items, total: items.length, has_more: false, state: "inbox", scored_count: 0, total_count: items.length }),
    );
  });
  await page.route(JOB_ACTION, async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    actions.push(action);
    if (options.appliedElsewhere) applied = true;
    if (action === "promote") {
      if (options.holdPromote) await options.holdPromote;
      applied = true;
      return route.fulfill(json({ id: "app-1" }, 201));
    }
    if (applied) return route.fulfill(json({ detail: ALREADY_APPLIED_DETAIL }, 409));
    return route.fulfill({ status: 204 });
  });
  return actions;
}

const postingTitle = (page: Page) => page.getByRole("heading", { name: "Backend Engineer" });
const dismissButton = (page: Page) => page.getByRole("button", { name: "Dismiss this posting" });

test("Dismiss on a posting already applied for elsewhere says it's in Applications, and the card goes", async ({ page }) => {
  const actions = await stubInbox(page, { appliedElsewhere: true });

  await page.goto("/discover");
  await dismissButton(page).click();
  await page.getByRole("button", { name: "Skip — dismiss without a reason" }).click();

  await expect(toast(page, ALREADY_APPLIED)).toBeVisible();
  await expect(toast(page, "Dismissed.")).toHaveCount(0);
  await expect(postingTitle(page)).toHaveCount(0);
  expect(actions).toEqual(["dismiss"]);
});

test("Save on a posting already applied for elsewhere says it's in Applications, and the card goes", async ({ page }) => {
  const actions = await stubInbox(page, { appliedElsewhere: true });

  await page.goto("/discover");
  await page.getByTestId("save-button").click();

  await expect(toast(page, ALREADY_APPLIED)).toBeVisible();
  await expect(postingTitle(page)).toHaveCount(0);
  expect(actions).toEqual(["save"]);
});

test("Apply keeps Save and Dismiss off from the click, and gone once it succeeds, until the posting leaves", async ({ page }) => {
  const promote = createGate();
  const refetch = createGate();
  const actions = await stubInbox(page, { holdPromote: promote.wait, holdRefetch: refetch.wait });

  await page.goto("/discover");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByRole("button", { name: "Adding…" })).toBeDisabled();
  await expect(page.getByTestId("save-button")).toBeDisabled();
  await expect(dismissButton(page)).toBeDisabled();

  promote.release();

  await expect(toast(page, PROMOTED)).toBeVisible();
  await expect(postingTitle(page)).toBeVisible();
  await expect(page.getByTestId("save-button")).toHaveCount(0);
  await expect(dismissButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();

  refetch.release();
  await expect(postingTitle(page)).toHaveCount(0);
  expect(actions).toEqual(["promote"]);
});
