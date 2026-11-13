/**
 * No-backend E2E for the Applications list: skeleton while loading, rows once
 * the stubbed list answers, the empty state, the error state on a 500, and
 * paging past the first page.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication } from "./fixtures/mockData";

const APPLICATIONS_ENDPOINT = /\/api\/applications(\?|$)/;

test("shows the skeleton, then the stubbed applications as rows", async ({ page }) => {
  await stubSignedInShell(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(APPLICATIONS_ENDPOINT, async (route) => {
    await held;
    await route.fulfill(
      json({
        items: [
          mockApplication({ id: "a1", role_title: "Staff Engineer", company_name: "Acme Corp", latest_status: "applied" }),
          mockApplication({ id: "a2", role_title: "Data Scientist", company_name: "Globex", latest_status: "interview" }),
        ],
        total: 2,
      }),
    );
  });

  await page.goto("/applications");
  await expect(page.getByLabel("Loading applications")).toBeVisible();

  release();
  await expect(page.getByLabel("Loading applications")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Staff Engineer" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Globex" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("an empty list shows the empty state with its call to action", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(APPLICATIONS_ENDPOINT, (route) => route.fulfill(json({ items: [], total: 0 })));

  await page.goto("/applications");

  await expect(page.getByText("No applications yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add application" })).toBeVisible();
});

test("a 500 shows the error state, never the empty state", async ({ page }) => {
  await stubSignedInShell(page);
  await page.route(APPLICATIONS_ENDPOINT, (route) => route.fulfill(json({ detail: "boom" }, 500)));

  await page.goto("/applications");

  await expect(page.getByText("Couldn't load applications")).toBeVisible();
  await expect(page.getByText("The server returned 500. Try refreshing.")).toBeVisible();
  await expect(page.getByText("No applications yet")).toHaveCount(0);
});

/** More applications than the page asks for at once (and more than the server's default page). */
const MANY = Array.from({ length: 120 }, (_, i) =>
  mockApplication({ id: `a${i}`, role_title: `Role ${i}`, company_name: `Company ${i}` }),
);

function pageParams(url: string): { sort: string | null; order: string | null; offset: number; limit: number } {
  const params = new URL(url).searchParams;
  return { sort: params.get("sort"), order: params.get("order"), offset: Number(params.get("offset")), limit: Number(params.get("limit")) };
}

test("more than one page: Load more appends each next page and the count shows the real total", async ({ page }) => {
  await stubSignedInShell(page);
  const requested: ReturnType<typeof pageParams>[] = [];
  await page.route(APPLICATIONS_ENDPOINT, async (route) => {
    const params = pageParams(route.request().url());
    requested.push(params);
    await route.fulfill(json({ items: MANY.slice(params.offset, params.offset + params.limit), total: MANY.length }));
  });

  await page.goto("/applications");

  await expect.poll(() => requested.length).toBe(1);
  const pageSize = requested[0].limit;
  expect(pageSize).toBeGreaterThan(0);
  expect(pageSize).toBeLessThan(MANY.length);
  await expect(page.locator("tbody tr")).toHaveCount(pageSize);
  await expect(page.getByText(`Showing ${pageSize} of ${MANY.length} applications`)).toBeVisible();
  await expect(page.getByRole("cell", { name: `Role ${MANY.length - 1}`, exact: true })).toHaveCount(0);

  const loadMore = page.getByRole("button", { name: "Load more" });
  for (let shown = pageSize; shown < MANY.length; shown += pageSize) {
    await loadMore.click();
    await expect(page.locator("tbody tr")).toHaveCount(Math.min(shown + pageSize, MANY.length));
  }

  await expect(page.getByRole("cell", { name: `Role ${MANY.length - 1}`, exact: true })).toBeVisible();
  // Everything is loaded, so the control goes away.
  await expect(loadMore).toHaveCount(0);
  expect(requested.map(({ sort, order, offset }) => [sort, order, offset])).toEqual(
    Array.from({ length: Math.ceil(MANY.length / pageSize) }, (_, i) => ["applied", "desc", i * pageSize]),
  );
});

test("a failed next page keeps the loaded rows and offers Try again", async ({ page }) => {
  await stubSignedInShell(page);
  let failNextPage = true;
  let firstPage = 0;
  await page.route(APPLICATIONS_ENDPOINT, async (route) => {
    const { offset, limit } = pageParams(route.request().url());
    if (offset === 0) firstPage = limit;
    if (offset > 0 && failNextPage) return route.fulfill(json({ detail: "boom" }, 500));
    await route.fulfill(json({ items: MANY.slice(offset, offset + limit), total: MANY.length }));
  });

  await page.goto("/applications");
  // The loading skeleton is also a table with 5 `tbody tr`, so wait for the real first page by its size, not for "a row".
  await expect.poll(() => firstPage).toBeGreaterThan(0);
  await expect(page.locator("tbody tr")).toHaveCount(firstPage);
  await page.getByRole("button", { name: "Load more" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Couldn't load more applications." })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(firstPage);
  await expect(page.getByText("Couldn't load applications")).toHaveCount(0);

  failNextPage = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(firstPage * 2);
});
