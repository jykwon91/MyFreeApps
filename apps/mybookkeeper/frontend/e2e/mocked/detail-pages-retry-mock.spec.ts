/**
 * No-backend E2E for Retry on a detail page whose record failed to load.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * RTK clears ``isError`` the moment a retry starts while there's still no record.
 * Pages that read it either went blank (listing, welcome manual, the plan dialog)
 * or swapped the error for a skeleton, so their "Retrying..." never showed
 * (inquiry, applicant, vendor and the rest). These specs fail the load, hold the
 * retry's answer open, and check that the error stays with Retry busy until the
 * record lands.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubNoListings } from "./fixtures/emptyLists";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";
import { LISTING, LISTING_ID } from "./fixtures/mockListing";
import { INQUIRY_DETAIL, INQUIRY_ID } from "./fixtures/mockInquiry";
import { TAX_RETURN, TAX_RETURN_ID, stubTaxReturnSourceDocuments } from "./fixtures/mockTaxReturn";

interface DetailPage {
  name: string;
  path: string;
  endpoint: RegExp;
  error: string;
  record: unknown;
  loaded: (page: Page) => Locator;
  skeleton: string;
  /** Reads the loaded page makes that the catch-all can't answer. */
  stubPage?: (page: Page) => Promise<void>;
}

const PAGES: DetailPage[] = [
  {
    name: "listing",
    path: `/listings/${LISTING_ID}`,
    endpoint: new RegExp(`/api/listings/${LISTING_ID}$`),
    error: "I couldn't load this listing. Want me to try again?",
    record: LISTING,
    loaded: (p) => p.getByRole("heading", { name: LISTING.title }),
    skeleton: "listing-detail-skeleton",
  },
  {
    name: "inquiry",
    path: `/inquiries/${INQUIRY_ID}`,
    endpoint: new RegExp(`/api/inquiries/${INQUIRY_ID}$`),
    error: "I couldn't load this inquiry. Want me to try again?",
    record: INQUIRY_DETAIL,
    loaded: (p) => p.getByRole("heading", { name: INQUIRY_DETAIL.inquirer_name }),
    skeleton: "inquiry-detail-skeleton",
  },
  {
    // Used to say "I couldn't find that tax return." with no way to retry.
    name: "tax return",
    path: `/tax-returns/${TAX_RETURN_ID}`,
    endpoint: new RegExp(`/api/tax-returns/${TAX_RETURN_ID}$`),
    error: "I couldn't load this tax return. Want me to try again?",
    record: TAX_RETURN,
    loaded: (p) => p.getByRole("heading", { name: "2025 Tax Return" }),
    skeleton: "tax-return-skeleton",
    stubPage: stubTaxReturnSourceDocuments,
  },
];

function retryButtonNextTo(page: Page, message: string, name: "Retry" | "Retrying...") {
  return page.getByText(message).locator("..").getByRole("button", { name, exact: true });
}

async function signIn(page: Page): Promise<void> {
  await plantAuth(page);
  // Registered first so the specific routes win; the page's other reads get an empty answer.
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await stubNoListings(page);
}

for (const detail of PAGES) {
  test(`${detail.name}: a failed load keeps its error through Retry until the record loads`, async ({ page }) => {
    await signIn(page);
    await detail.stubPage?.(page);
    const load = await failUntilRecovered(page, detail.endpoint, detail.record);

    await page.goto(detail.path);
    await expect(page.getByText(detail.error)).toBeVisible();
    await expect(retryButtonNextTo(page, detail.error, "Retry")).toBeEnabled();

    load.recover();
    const before = load.loads();
    await retryButtonNextTo(page, detail.error, "Retry").click();
    // One click, one request: the busy button can't double-fire.
    await expect.poll(load.loads).toBe(before + 1);

    await expect(retryButtonNextTo(page, detail.error, "Retrying...")).toBeDisabled();
    await expect(page.getByTestId(detail.skeleton)).toHaveCount(0);

    load.release();
    await expect(detail.loaded(page)).toBeVisible();
    await expect(page.getByText(detail.error)).toHaveCount(0);
    expect(load.loads()).toBe(before + 1);
  });
}
