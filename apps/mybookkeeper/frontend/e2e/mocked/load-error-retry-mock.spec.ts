/**
 * No-backend E2E for the shared "couldn't load" alert on list pages.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies, on one page from each shape that moved onto LoadErrorAlert, that a failed
 * load says so and that Retry loads again once, and the alert stays gone after it
 * succeeds. These pages show the alert only while `isError` is set, which RTK Query
 * clears as soon as a retry starts, so the alert gives way to the page's loading state.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { plantAuth, stubSignedInShell } from "./fixtures/mockSession";

const EMPTY_PAGE = { items: [], total: 0, has_more: false };

const PAGES = [
  { path: "/tenants", api: "/applicants/tenants", message: "I couldn't load your tenants. Want me to try again?" },
  { path: "/listings", api: "/listings", message: "I couldn't load your listings. Want me to try again?" },
  { path: "/utility-plans", api: "/utility-plans", message: "Couldn't load utility plans." },
] as const;

/**
 * Answers ``api`` with 500 until ``recover`` is called; after that its loads wait
 * until ``release`` is called. Returns how many loads it has seen.
 */
async function stubLoadFails(
  page: Page,
  api: string,
): Promise<{ recover: () => void; release: () => void; loads: () => number }> {
  let failing = true;
  let loads = 0;
  let release!: () => void;
  const retryAllowed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "admin");
  await page.route(new RegExp(`/api${api}(\\?|$)`), async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    loads += 1;
    if (failing) return route.fulfill(json({ detail: "Internal Server Error" }, 500));
    await retryAllowed;
    return route.fulfill(json(EMPTY_PAGE));
  });
  return {
    recover: () => {
      failing = false;
    },
    release,
    loads: () => loads,
  };
}

for (const { path, api, message } of PAGES) {
  test(`${path}: a failed load says so, and Retry loads it again`, async ({ page }) => {
    await plantAuth(page);
    const { recover, release, loads } = await stubLoadFails(page, api);
    await page.goto(path);

    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await expect(page.getByText(message)).toBeVisible();
    await expect(retry).toBeEnabled();

    recover();
    const before = loads();
    await retry.click();
    await expect(page.getByText(message)).toHaveCount(0);
    await expect.poll(loads).toBe(before + 1);

    release();
    await expect(page.getByText(message)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retry/ })).toHaveCount(0);
    expect(loads()).toBe(before + 1);
  });
}
