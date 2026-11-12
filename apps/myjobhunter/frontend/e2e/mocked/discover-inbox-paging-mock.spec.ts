/**
 * No-backend E2E for the Discovery inbox: Load more pages past the old 200-row cap, appending each
 * page, and a list that fails to load offers Retry.
 */
import { test, expect } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const DISCOVER_ENDPOINT = /\/api\/discover(\?|$)/;
const SOURCES_ENDPOINT = /\/api\/discover\/sources(\?|$)/;
const TOTAL = 230;

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

function posting(index: number) {
  return {
    id: `job-${index}`,
    source: "jsearch",
    source_publisher: null,
    source_url: null,
    title: `Posting ${index}`,
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
}

const ALL = Array.from({ length: TOTAL }, (_, i) => posting(i));

function pageParams(url: string): { offset: number; limit: number } {
  const params = new URL(url).searchParams;
  return { offset: Number(params.get("offset")), limit: Number(params.get("limit")) };
}

function pageOf(offset: number, limit: number) {
  const items = ALL.slice(offset, offset + limit);
  return { items, total: TOTAL, has_more: offset + items.length < TOTAL, state: "inbox", scored_count: 0, total_count: TOTAL };
}

test("Load more pages the inbox past 200 postings, appending each page", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([SOURCE])));
  const requested: { offset: number; limit: number }[] = [];
  await page.route(DISCOVER_ENDPOINT, async (route) => {
    const params = pageParams(route.request().url());
    requested.push(params);
    await route.fulfill(json(pageOf(params.offset, params.limit)));
  });

  await page.goto("/discover");

  await expect.poll(() => requested.length).toBe(1);
  const pageSize = requested[0].limit;
  expect(pageSize).toBeLessThan(TOTAL);
  const cards = page.getByText(/^Posting \d+$/);
  await expect(cards).toHaveCount(pageSize);

  const loadMore = page.getByRole("button", { name: "Load more" });
  for (let shown = pageSize; shown < TOTAL; shown += pageSize) {
    await loadMore.click();
    await expect(cards).toHaveCount(Math.min(shown + pageSize, TOTAL));
  }

  await expect(page.getByText(`Posting ${TOTAL - 1}`, { exact: true })).toBeVisible();
  await expect(loadMore).toHaveCount(0);
  // One request per page, each starting where the last ended; nothing reloaded.
  expect(requested.map(({ offset }) => offset)).toEqual(
    Array.from({ length: Math.ceil(TOTAL / pageSize) }, (_, i) => i * pageSize),
  );
  expect(requested[requested.length - 1].offset).toBeGreaterThanOrEqual(200);
});

test("an inbox that can't load offers Retry, which loads it", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(SOURCES_ENDPOINT, (route) => route.fulfill(json([SOURCE])));
  let fail = true;
  await page.route(DISCOVER_ENDPOINT, async (route) => {
    if (fail) return route.fulfill(json({ detail: "boom" }, 500));
    const { offset, limit } = pageParams(route.request().url());
    await route.fulfill(json(pageOf(offset, limit)));
  });

  await page.goto("/discover");
  await expect(page.getByText("Couldn't load the inbox.")).toBeVisible();

  fail = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Posting 0", { exact: true })).toBeVisible();
  await expect(page.getByText("Couldn't load the inbox.")).toHaveCount(0);
});
