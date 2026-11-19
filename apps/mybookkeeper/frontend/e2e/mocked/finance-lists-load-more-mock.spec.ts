/**
 * No-backend E2E: the Mortgages and Utility Plans pages page their lists by offset with Load more, so a
 * row past the first page is reachable. Before, each page showed only the server's first answer (50 rows)
 * and stopped. Also: a failed Load more keeps the rows with a Retry, and "needs renewing" on Utility
 * Plans is asked of the server from its first page. Runs under playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const SERVER_LIMIT_CAP = 100;
const ROW_COUNT = SERVER_LIMIT_CAP + 20;

function mortgage(n: number) {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    user_id: "u1",
    organization_id: "org-1",
    property_id: `prop-${n}`,
    property_name: `Loan house ${n}`,
    source_document_id: null,
    lender: null,
    account_number: null,
    current_balance_cents: null,
    statement_date: null,
    original_principal_cents: null,
    interest_rate: "6.500",
    rate_type: "fixed",
    fixed_until: null,
    maturity_date: null,
    term_months: null,
    monthly_principal_cents: null,
    monthly_interest_cents: null,
    monthly_escrow_cents: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function plan(n: number, renewalStatus: string) {
  return {
    id: `plan-${n}`,
    property_id: `prop-${n}`,
    property_name: `Plan house ${n}`,
    service_type: "electricity",
    provider_name: `Provider ${n}`,
    plan_name: null,
    rate_type: "fixed",
    avg_price_cents_per_kwh_at_1000: null,
    term_end_date: null,
    days_until_term_end: null,
    renewal_status: renewalStatus,
    is_current: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function pageOf<T>(rows: readonly T[], url: URL) {
  const limit = Number(url.searchParams.get("limit"));
  const offset = Number(url.searchParams.get("offset") ?? "0");
  return { items: rows.slice(offset, offset + limit), total: rows.length, has_more: offset + limit < rows.length };
}

function outOfRange(url: URL): boolean {
  const limit = Number(url.searchParams.get("limit"));
  return !(limit >= 1 && limit <= SERVER_LIMIT_CAP);
}

test("mortgages: Load more reaches a loan past the first page, and survives a failed page", async ({ page }) => {
  const rows = Array.from({ length: ROW_COUNT }, (_, i) => mortgage(i + 1));
  const offsets: string[] = [];
  let failNextPage = true;
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/mortgages(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    offsets.push(url.searchParams.get("offset") ?? "");
    if (outOfRange(url)) return route.fulfill(json({ detail: "limit out of range" }, 422));
    if (url.searchParams.get("offset") !== "0" && failNextPage) {
      failNextPage = false;
      return route.fulfill(json({ detail: "Internal Server Error" }, 500));
    }
    return route.fulfill(json(pageOf(rows, url)));
  });

  await page.goto("/mortgages");
  const row = (n: number) => page.getByText(`Loan house ${n}`, { exact: true }).locator("visible=true").first();
  await expect(row(SERVER_LIMIT_CAP)).toBeVisible();
  await expect(page.getByText(`Loan house ${SERVER_LIMIT_CAP + 1}`, { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Load more" }).locator("visible=true").first().click();
  await expect(page.getByText("I couldn't load more mortgages. Want me to try again?")).toBeVisible();
  await expect(row(1)).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();

  await expect(row(ROW_COUNT)).toBeVisible();
  await expect(page.getByText("I couldn't load more mortgages. Want me to try again?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(offsets).toEqual(["0", String(SERVER_LIMIT_CAP), String(SERVER_LIMIT_CAP)]);
});

test("utility plans: Load more reaches a plan past the first page, and 'needs renewing' starts over on the server", async ({ page }) => {
  const all = Array.from({ length: ROW_COUNT }, (_, i) => plan(i + 1, i === ROW_COUNT - 1 ? "expired" : "active"));
  const requests: URL[] = [];
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/utility-plans(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (outOfRange(url)) return route.fulfill(json({ detail: "limit out of range" }, 422));
    const needsRenewal = url.searchParams.get("needs_renewal") === "true";
    const rows = needsRenewal ? all.filter((p) => p.renewal_status === "expired") : all;
    return route.fulfill(json(pageOf(rows, url)));
  });

  await page.goto("/utility-plans");
  const row = (n: number) => page.getByTestId(`utility-plan-item-plan-${n}`).locator("visible=true").first();
  await expect(row(SERVER_LIMIT_CAP)).toBeVisible();
  await expect(page.getByTestId(`utility-plan-item-plan-${ROW_COUNT}`)).toHaveCount(0);

  await page.getByRole("button", { name: "Load more" }).locator("visible=true").first().click();
  await expect(row(ROW_COUNT)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);

  await page.getByTestId("utility-plans-expiring-toggle").click();
  await expect(row(ROW_COUNT)).toBeVisible();
  await expect(page.getByTestId("utility-plan-item-plan-1")).toHaveCount(0);
  const renewingOffsets = requests.filter((url) => url.searchParams.get("needs_renewal") === "true").map((url) => url.searchParams.get("offset"));
  expect(renewingOffsets).toEqual(["0"]);
});
