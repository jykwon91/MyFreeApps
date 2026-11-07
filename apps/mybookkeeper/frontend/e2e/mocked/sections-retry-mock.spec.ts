/**
 * No-backend E2E for Retry on the calendar, pending receipts, utility trends,
 * the lease template picker and a listing's channels.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Each of these shows "couldn't load" with Retry when its load fails. RTK clears
 * ``isError`` the moment a retry starts while there's still no data, which these
 * read as "nothing here": "No bookings", "No templates yet", the empty receipts
 * pitch. These specs fail the load, hold the retry's answer open, and check that
 * the error stays with Retry busy and nothing claims to be empty until the real
 * (empty) answer lands.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";
import { LISTING, LISTING_ID } from "./fixtures/mockListing";

const CHANNELS = [
  { id: "airbnb", name: "Airbnb", supports_ical_export: true, supports_ical_import: true, created_at: "2026-01-01T00:00:00Z" },
];

interface Section {
  name: string;
  path: string;
  endpoint: RegExp;
  error: string;
  emptyAnswer: unknown;
  empty: (page: Page) => Locator;
  /** Answers the page needs beyond the catch-all's `[]`. */
  stubPage?: (page: Page) => Promise<void>;
}

async function stubListingDetail(page: Page): Promise<void> {
  await page.route(`**/api/listings/${LISTING_ID}`, (route) =>
    route.request().method() === "GET" ? route.fulfill(json(LISTING)) : route.fallback(),
  );
  await page.route("**/api/channels", (route) => route.fulfill(json(CHANNELS)));
}

const SECTIONS: Section[] = [
  {
    name: "calendar",
    path: "/calendar",
    endpoint: /\/api\/calendar\/events(\?|$)/,
    error: "I couldn't load the calendar. Want me to try again?",
    emptyAnswer: [],
    // With no listings either, the calendar's empty state is the "add a listing" prompt.
    empty: (p) => p.getByTestId("calendar-no-listings"),
  },
  {
    name: "pending receipts",
    path: "/receipts",
    endpoint: /\/api\/rent-receipts\/pending(\?|$)/,
    error: "Couldn't load pending receipts.",
    emptyAnswer: { items: [], total: 0, pending_count: 0, gmail_state: "ready" },
    empty: (p) => p.getByText(/I'll queue a receipt here/),
  },
  {
    name: "utility trends",
    path: "/analytics",
    endpoint: /\/api\/analytics\/utility-trends(\?|$)/,
    error: "I ran into a problem loading your utility data. Want me to try again?",
    emptyAnswer: { trends: [], summary: {}, total_spend: 0 },
    empty: (p) => p.getByText(/I haven't found any utility expenses yet/),
  },
  {
    name: "lease template picker",
    path: "/leases/new",
    endpoint: /\/api\/lease-templates(\?|$)/,
    error: "I couldn't load your templates. Want me to try again?",
    emptyAnswer: { items: [], total: 0, has_more: false },
    empty: (p) => p.getByTestId("multi-template-picker-empty"),
  },
  {
    name: "listing channels",
    path: `/listings/${LISTING_ID}`,
    endpoint: new RegExp(`/api/listings/${LISTING_ID}/channels$`),
    error: "I couldn't load the channels for this listing.",
    emptyAnswer: [],
    empty: (p) => p.getByTestId("channels-section-empty-state"),
    stubPage: stubListingDetail,
  },
];

function retryButtonNextTo(page: Page, message: string, name: "Retry" | "Retrying...") {
  return page.getByText(message).locator("..").getByRole("button", { name, exact: true });
}

async function signIn(page: Page): Promise<void> {
  await plantAuth(page);
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "admin");
}

for (const section of SECTIONS) {
  test(`${section.name}: a failed load never reads as empty, through Retry and until it loads`, async ({ page }) => {
    await signIn(page);
    await section.stubPage?.(page);
    const load = await failUntilRecovered(page, section.endpoint, section.emptyAnswer);

    await page.goto(section.path);
    await expect(page.getByText(section.error)).toBeVisible();
    await expect(retryButtonNextTo(page, section.error, "Retry")).toBeEnabled();
    await expect(section.empty(page)).toHaveCount(0);

    load.recover();
    const before = load.loads();
    await retryButtonNextTo(page, section.error, "Retry").click();
    // One click, one request: the busy button can't double-fire.
    await expect.poll(load.loads).toBe(before + 1);

    await expect(retryButtonNextTo(page, section.error, "Retrying...")).toBeDisabled();
    await expect(section.empty(page)).toHaveCount(0);

    load.release();
    await expect(section.empty(page)).toBeVisible();
    await expect(page.getByText(section.error)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retry/ })).toHaveCount(0);
    expect(load.loads()).toBe(before + 1);
  });
}

test("listing channels: a failed channel list says why adding is unavailable, and Retry brings the button back", async ({ page }) => {
  const message = "I couldn't load the channels you can link, so adding one isn't available right now.";
  await signIn(page);
  await stubListingDetail(page);
  await page.route(new RegExp(`/api/listings/${LISTING_ID}/channels$`), (route) => route.fulfill(json([])));
  const channels = await failUntilRecovered(page, /\/api\/channels$/, CHANNELS);

  await page.goto(`/listings/${LISTING_ID}`);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByTestId("channels-section-add-cta")).toHaveCount(0);

  channels.recover();
  await retryButtonNextTo(page, message, "Retry").click();
  await expect(retryButtonNextTo(page, message, "Retrying...")).toBeDisabled();

  channels.release();
  await expect(page.getByTestId("channels-section-add-cta")).toBeVisible();
  await expect(page.getByText(message)).toHaveCount(0);
});
