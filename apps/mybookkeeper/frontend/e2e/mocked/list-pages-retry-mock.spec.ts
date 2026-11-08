/**
 * No-backend E2E for Retry on the list pages (properties, tenants, vendors, inquiries,
 * leases, lease templates, listings, welcome manuals, applicants, insurance,
 * mortgages, utility plans).
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Each page shows "couldn't load" with Retry when its list fails. RTK clears
 * ``isError`` and ``isLoading`` the moment a retry starts while the list still
 * has no data, which these pages read as an empty list: "No tenants yet" under
 * no error at all (or, on insurance, mortgages and utility plans, the empty
 * state under the error even before Retry). These specs fail the list, hold
 * the retry's answer open, and check that the page keeps its error with Retry
 * busy and never claims the list is empty until the real (empty) answer lands.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";

const EMPTY_PAGE = { items: [], total: 0, has_more: false };

interface ListPage {
  name: string;
  path: string;
  endpoint: RegExp;
  error: string;
  empty: (page: Page) => Locator;
  /** The list's empty answer; paged endpoints by default. */
  emptyAnswer?: unknown;
  /** Answers for the page's other panels, where the catch-all's `[]` isn't their shape. */
  stubPanels?: (page: Page) => Promise<void>;
}

async function stubInsurancePanels(page: Page): Promise<void> {
  await page.route("**/api/insurance-benchmarks*", (route) => route.fulfill(json(null)));
}

const LIST_PAGES: ListPage[] = [
  { name: "properties", path: "/properties", endpoint: /\/api\/properties(\?|$)/, error: "I couldn't load your properties.", empty: (p) => p.getByText(/Add your first property above/), emptyAnswer: [] },
  { name: "tenants", path: "/tenants", endpoint: /\/api\/applicants\/tenants(\?|$)/, error: "I couldn't load your tenants.", empty: (p) => p.getByText(/No active tenants/) },
  { name: "vendors", path: "/vendors", endpoint: /\/api\/vendors(\?|$)/, error: "I couldn't load your vendors.", empty: (p) => p.getByText(/No vendors yet/) },
  { name: "inquiries", path: "/inquiries", endpoint: /\/api\/inquiries(\?|$)/, error: "I couldn't load your inquiries.", empty: (p) => p.getByText(/No inquiries yet/) },
  { name: "leases", path: "/leases", endpoint: /\/api\/signed-leases(\?|$)/, error: "I couldn't load your leases.", empty: (p) => p.getByText(/No leases yet/) },
  { name: "lease templates", path: "/lease-templates", endpoint: /\/api\/lease-templates(\?|$)/, error: "I couldn't load your templates.", empty: (p) => p.getByText(/No templates yet/) },
  { name: "listings", path: "/listings", endpoint: /\/api\/listings(\?|$)/, error: "I couldn't load your listings.", empty: (p) => p.getByText(/No listings yet/) },
  { name: "welcome manuals", path: "/welcome-manuals", endpoint: /\/api\/welcome-manuals(\?|$)/, error: "I couldn't load your welcome manuals.", empty: (p) => p.getByText(/No welcome manuals yet/) },
  { name: "applicants", path: "/applicants", endpoint: /\/api\/applicants(\?|$)/, error: "I couldn't load your applicants.", empty: (p) => p.getByText(/No applicants yet/) },
  { name: "insurance policies", path: "/insurance-policies", endpoint: /\/api\/insurance-policies(\?|$)/, error: "Couldn't load insurance policies.", empty: (p) => p.getByTestId("insurance-policies-empty"), stubPanels: stubInsurancePanels },
  { name: "mortgages", path: "/mortgages", endpoint: /\/api\/mortgages(\?|$)/, error: "Couldn't load mortgages.", empty: (p) => p.getByTestId("mortgages-empty") },
  { name: "utility plans", path: "/utility-plans", endpoint: /\/api\/utility-plans(\?|$)/, error: "Couldn't load utility plans.", empty: (p) => p.getByTestId("utility-plans-empty") },
];

function retryButtonNextTo(page: Page, message: string, name: "Retry" | "Retrying...") {
  return page.getByText(message).locator("..").getByRole("button", { name, exact: true });
}

for (const listPage of LIST_PAGES) {
  test(`${listPage.name}: a failed list never reads as empty, through Retry and until it loads`, async ({ page }) => {
    await plantAuth(page);
    await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
    await stubSignedInShell(page, "admin");
    await listPage.stubPanels?.(page);
    const list = await failUntilRecovered(page, listPage.endpoint, listPage.emptyAnswer ?? EMPTY_PAGE);

    await page.goto(listPage.path);
    await expect(page.getByText(listPage.error)).toBeVisible();
    await expect(retryButtonNextTo(page, listPage.error, "Retry")).toBeEnabled();
    await expect(listPage.empty(page)).toHaveCount(0);

    list.recover();
    const before = list.loads();
    await retryButtonNextTo(page, listPage.error, "Retry").click();
    // One click, one request: the busy button can't double-fire.
    await expect.poll(list.loads).toBe(before + 1);

    await expect(retryButtonNextTo(page, listPage.error, "Retrying...")).toBeDisabled();
    await expect(listPage.empty(page)).toHaveCount(0);

    list.release();
    await expect(listPage.empty(page)).toBeVisible();
    await expect(page.getByText(listPage.error)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Retry/ })).toHaveCount(0);
    expect(list.loads()).toBe(before + 1);
  });
}

// RTK keeps the previous filter's answer as `data` when a load for a new filter
// fails, so an empty earlier answer must not read as "nothing matches".
test("vendors: a failed filter never reads as 'no matches'", async ({ page }) => {
  await plantAuth(page);
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "admin");
  await page.route(/\/api\/vendors(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const failing = new URL(route.request().url()).searchParams.get("category") === "plumber";
    return route.fulfill(failing ? json({ detail: "Internal Server Error" }, 500) : json(EMPTY_PAGE));
  });

  await page.goto("/vendors");
  await expect(page.getByText(/No vendors yet/)).toBeVisible();

  await page.getByTestId("vendor-filter-plumber").click();
  await expect(page.getByText("I couldn't load your vendors.")).toBeVisible();
  await expect(page.getByText(/No vendors match this filter/)).toHaveCount(0);
  await expect(page.getByText(/No vendors yet/)).toHaveCount(0);
});
