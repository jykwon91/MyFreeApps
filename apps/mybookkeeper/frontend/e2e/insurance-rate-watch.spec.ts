/**
 * No-backend E2E for the "Check for rate increases" section.
 *
 * Fully mocks the API surface via page.route() so it runs under
 * playwright.layout.config.ts in the `frontend-layout-e2e` CI job (no backend,
 * no globalSetup) — the same shape utility-better-plans.spec.ts uses.
 *
 * Mocking is not a compromise here: the upstream source is the Texas
 * Department of Insurance filing dataset, which changes as carriers file.
 * Asserting against whatever it happens to hold the morning the suite runs
 * would test the Texas insurance market, not this code. What is exercised is
 * ours — the check is explicit, the skeleton matches the loaded shape, an
 * unmatched carrier is named rather than left blank, a filing that never took
 * effect is labelled, and an outage reads as an outage.
 *
 * Verifies:
 *   - Loading the page does not call the department; only a click does.
 *   - Skeleton card/row counts mirror the loaded section (no layout shift).
 *   - The projected renewal reads as a movement from today's premium, marked
 *     as an estimate.
 *   - A carrier with no filings says so instead of rendering as "all clear".
 *   - A withdrawn filing is labelled "Not approved".
 *   - No horizontal scroll across mobile / tablet / desktop; 44px touch target.
 *   - A feed outage renders the reason rather than an empty section.
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "00000000-0000-0000-0000-000000000010";
const POLICY_ID = "00000000-0000-0000-0000-0000000000d1";
const UNMATCHED_POLICY_ID = "00000000-0000-0000-0000-0000000000d2";

/** Matches ``RateWatchSkeleton``: two policy cards, two filing rows each. */
const SKELETON_CARD_COUNT = 2;

const FEED_DOWN_REASON =
  "The Texas Department of Insurance filing data could not be reached, so nothing was checked.";

function plantAuth(page: Page): Promise<void> {
  return page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}

function json(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function stubShell(page: Page): Promise<void> {
  await page.route("**/api/users/me", (route) =>
    route.fulfill(
      json({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        name: "Test User",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: "owner",
      }),
    ),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: "owner" }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json({ version: "test" })));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(
      json({
        onboarding_completed: true,
        tax_situations: [],
        filing_status: null,
        dependents_count: 0,
      }),
    ),
  );
  await page.route("**/api/properties", (route) => route.fulfill(json([])));
  // Shell-level polls. Unstubbed they 401 against the dev proxy, and the axios
  // interceptor logs the session out mid-test — which shows up as the section
  // detaching from the DOM rather than as an auth failure.
  await page.route("**/api/integrations", (route) => route.fulfill(json([])));
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
}

/**
 * The rest of the Insurance page. `**\/api/insurance-policies*` stops at the
 * next `/`, so it never swallows `/insurance-market/rate-watch`.
 */
async function stubInsurancePage(page: Page): Promise<void> {
  await page.route("**/api/insurance-policies/premium-comparison*", (route) =>
    route.fulfill(
      json({
        material_gap_pct: 15,
        benchmark: null,
        above_market: [],
        not_compared: [],
        total_above_market: 0,
        total_considered: 0,
        has_stale_benchmark: false,
      }),
    ),
  );
  await page.route("**/api/insurance-benchmarks*", (route) => route.fulfill(json(null)));
  await page.route("**/api/insurance-policies?*", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/insurance-policies", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
}

const APPROVED_FILING = {
  serff_id: "SFPT-134523456",
  company_name: "SAFEPOINT INSURANCE COMPANY",
  product_name: "TX DWO",
  percent_change: 11.1,
  filed_date: "2026-05-28",
  effective_date_renewal: "2026-09-01",
  is_in_force: true,
  is_pending: false,
};

const WITHDRAWN_FILING = {
  serff_id: "SFPT-134523099",
  company_name: "SAFEPOINT INSURANCE COMPANY",
  product_name: "TX Business Advantage Program",
  percent_change: 24.0,
  filed_date: "2026-02-19",
  effective_date_renewal: "2026-05-01",
  is_in_force: false,
  is_pending: false,
};

const FLAT_FILING = {
  serff_id: "FRMT-260724001",
  company_name: "FOREMOST LLOYDS OF TEXAS",
  product_name: "Dwelling Program - Landlord",
  percent_change: 0.0,
  filed_date: "2026-07-24",
  effective_date_renewal: "2026-10-14",
  is_in_force: true,
  is_pending: false,
};

const RATE_WATCH_RESPONSE = {
  outlooks: [
    {
      policy_id: POLICY_ID,
      policy_name: "Dwelling DP-3",
      property_name: "E2E Peerless",
      carrier: "SafePoint",
      expiration_date: "2026-09-24",
      current_premium_cents: 241_000,
      filings: [APPROVED_FILING, WITHDRAWN_FILING],
      projected_change_pct: 11.1,
      projected_premium_cents: 267_751,
      unavailable_reason: null,
    },
    {
      policy_id: UNMATCHED_POLICY_ID,
      policy_name: "Dwelling DP-3",
      property_name: "E2E Second Peerless",
      carrier: "Benchmark/Swyfft",
      expiration_date: "2027-02-01",
      current_premium_cents: 180_000,
      filings: [],
      projected_change_pct: null,
      projected_premium_cents: null,
      unavailable_reason: "No dwelling-line filings found under this carrier's name.",
    },
  ],
  market_filings: [FLAT_FILING, APPROVED_FILING],
  has_any_increase: true,
  feed_unavailable_reason: null,
};

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.beforeEach(async ({ page }) => {
  await plantAuth(page);
  await stubShell(page);
  await stubInsurancePage(page);
});

test.describe("Check for rate increases", () => {
  test("checks only when asked, then shows the outlook with its caveats", async ({
    page,
  }) => {
    let watchRequests = 0;
    await page.route("**/api/insurance-market/rate-watch*", async (route) => {
      watchRequests += 1;
      // Held long enough for the skeleton to be observable on the one click.
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill(json(RATE_WATCH_RESPONSE));
    });

    await page.goto("/insurance-policies");

    // Loading the page must not reach the department on its own.
    await expect(page.getByTestId("rate-watch-idle")).toBeVisible({ timeout: 15000 });
    expect(watchRequests, "feed was hit before the operator asked").toBe(0);

    await page.getByTestId("check-rate-filings-button").click();

    const skeleton = page.getByTestId("rate-watch-loading");
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await expect(skeleton.locator("ul > li")).toHaveCount(SKELETON_CARD_COUNT);

    const results = page.getByTestId("rate-watch-results");
    await expect(results).toBeVisible({ timeout: 15000 });
    expect(watchRequests).toBe(1);

    // The projection reads as a movement from today's premium, and never as a
    // quote: a filing is a statewide average, not this house's renewal.
    const projection = page.getByTestId("rate-watch-outlook-projection");
    await expect(projection).toContainText("$2,410/yr");
    await expect(projection).toContainText("$2,678/yr");
    await expect(projection).toContainText("+11.1%");
    await expect(projection).toContainText("estimated");

    // The bigger number on the card is one the carrier asked for and did not
    // get. Unlabelled, it would read as the coming increase.
    const cards = page.getByTestId("rate-watch-outlook-card");
    await expect(cards.first()).toContainText("Not approved");
    await expect(cards.first()).toContainText("Approved");

    // A carrier the department publishes nothing for says so. Silence here
    // would read as "no increase coming".
    await expect(page.getByTestId("rate-watch-outlook-unavailable")).toContainText(
      "No dwelling-line filings found under this carrier's name.",
    );

    // The market half: who to ask an agent about.
    const market = page.getByTestId("rate-watch-market-list");
    await expect(market).toContainText("FOREMOST LLOYDS OF TEXAS");
    await expect(market).toContainText("no change");

    // A projection is arithmetic on a statewide average, not a bill promise.
    await expect(results).toContainText("statewide average");
  });

  test("the section fits every viewport and keeps a 44px touch target", async ({
    page,
  }) => {
    await page.route("**/api/insurance-market/rate-watch*", (route) =>
      route.fulfill(json(RATE_WATCH_RESPONSE)),
    );

    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/insurance-policies");

      const button = page.getByTestId("check-rate-filings-button");
      await expect(button).toBeVisible({ timeout: 15000 });
      await button.click();
      await expect(page.getByTestId("rate-watch-results")).toBeVisible({
        timeout: 15000,
      });

      expect(
        await hasHorizontalOverflow(page),
        `horizontal overflow at ${size.width}px`,
      ).toBe(false);
    }

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/insurance-policies");
    const button = page.getByTestId("check-rate-filings-button");
    await expect(button).toBeVisible({ timeout: 15000 });
    const box = await button.boundingBox();
    expect(box, "check button has no box").not.toBeNull();
    expect(box!.height, "check button height").toBeGreaterThanOrEqual(44);
  });

  test("a feed outage reads as an outage, not as good news", async ({ page }) => {
    await page.route("**/api/insurance-market/rate-watch*", (route) =>
      route.fulfill(
        json({
          ...RATE_WATCH_RESPONSE,
          outlooks: [
            {
              ...RATE_WATCH_RESPONSE.outlooks[0],
              filings: [],
              projected_change_pct: null,
              projected_premium_cents: null,
              unavailable_reason: FEED_DOWN_REASON,
            },
          ],
          market_filings: [],
          has_any_increase: false,
          feed_unavailable_reason: FEED_DOWN_REASON,
        }),
      ),
    );

    await page.goto("/insurance-policies");
    await page.getByTestId("check-rate-filings-button").click();

    const results = page.getByTestId("rate-watch-results");
    await expect(results).toContainText("could not be reached");
    // The absence of a projection must be explained, never left blank.
    await expect(page.getByTestId("rate-watch-outlook-unavailable")).toContainText(
      "nothing was checked",
    );
  });

  test("a request failure keeps the blame off the policies", async ({ page }) => {
    await page.route("**/api/insurance-market/rate-watch*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "rate_filing_feed_unavailable" }),
      }),
    );

    await page.goto("/insurance-policies");
    await page.getByTestId("check-rate-filings-button").click();

    await expect(page.getByTestId("rate-watch-error")).toContainText(
      "Nothing is wrong with your policies",
    );
  });
});
