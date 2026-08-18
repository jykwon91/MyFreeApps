/**
 * No-backend E2E for the "Check for better rates" section.
 *
 * Fully mocks the API surface via page.route() so it runs under
 * playwright.layout.config.ts in the `frontend-layout-e2e` CI job (no backend,
 * no globalSetup) — the same shape insurance-rate-watch.spec.ts uses.
 *
 * Mocking the survey is not a compromise: the upstream source is Freddie Mac's
 * weekly average, republished through FRED. Asserting against whatever it holds
 * the morning the suite runs would test the mortgage market rather than this
 * code. What is exercised is ours — the check is explicit, the skeleton matches
 * the loaded shape, every loan is accounted for whether or not it could be
 * compared, a blocked loan can be unblocked in place, and an outage reads as an
 * outage rather than as an all-clear.
 *
 * Verifies:
 *   - Loading the page does not reach FRED; only a click does.
 *   - The verdict leads, in dollars per month, above any evidence.
 *   - Every loan gets a card, and a scope line accounts for all of them.
 *   - Skeleton card/row counts mirror the loaded section (no layout shift).
 *   - The arithmetic is shown in the order it was done, break-even last.
 *   - A loan blocked on an unclassified property can be fixed without leaving
 *     the page, and the check re-runs by itself afterwards.
 *   - The benchmark and its date are cited, with the rental adjustment named.
 *   - No horizontal scroll across mobile / tablet / desktop; 44px touch target.
 *   - A feed outage renders the reason and offers no verdict at all.
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "00000000-0000-0000-0000-000000000010";
const PROPERTY_ID = "00000000-0000-0000-0000-0000000000e1";
const BLOCKED_PROPERTY_ID = "00000000-0000-0000-0000-0000000000e2";
const MORTGAGE_ID = "00000000-0000-0000-0000-0000000000f1";
const BLOCKED_MORTGAGE_ID = "00000000-0000-0000-0000-0000000000f2";

/** Matches ``MortgageRateWatchSkeleton``: three cards, eight figure rows each. */
const SKELETON_CARD_COUNT = 3;
const SKELETON_ROW_COUNT = 8;

const FEED_DOWN_REASON =
  "This week's published rate data couldn't be reached, so nothing was checked.";

const UNCLASSIFIED_REASON =
  "This property isn't marked as a rental or a home you live in, and the two are priced differently.";

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

const PROPERTIES = [
  {
    id: PROPERTY_ID,
    name: "E2E Peerless",
    address: "1 Peerless St",
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: BLOCKED_PROPERTY_ID,
    name: "E2E Unclassified",
    address: "2 Peerless St",
    classification: "unclassified",
    type: null,
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
  },
];

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
  // Shell-level polls. Unstubbed they 401 against the dev proxy, and the axios
  // interceptor logs the session out mid-test — which shows up as the section
  // detaching from the DOM rather than as an auth failure.
  await page.route("**/api/integrations", (route) => route.fulfill(json([])));
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
}

const MORTGAGE_LIST = {
  items: [
    {
      id: MORTGAGE_ID,
      user_id: "00000000-0000-0000-0000-000000000001",
      organization_id: ORG_ID,
      property_id: PROPERTY_ID,
      property_name: "E2E Peerless",
      source_document_id: null,
      lender: "E2E Credit Union",
      account_number: null,
      current_balance_cents: 33613735,
      statement_date: "2026-08-01",
      original_principal_cents: null,
      interest_rate: "8.250",
      rate_type: "fixed",
      fixed_until: null,
      maturity_date: null,
      term_months: null,
      monthly_principal_cents: 30156,
      monthly_interest_cents: 199582,
      monthly_escrow_cents: 87081,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
  ],
  total: 1,
  has_more: false,
};

/**
 * The loan list, so the page under the section is not itself in an error state.
 *
 * Both globs are registered because the list query only appends a query string
 * when it is given arguments, and `**\/api/mortgages` stops at the next `/`, so
 * neither pattern can swallow `/api/mortgage-market/rate-watch`.
 */
async function stubMortgagesList(page: Page): Promise<void> {
  await page.route("**/api/mortgages?*", (route) => route.fulfill(json(MORTGAGE_LIST)));
  await page.route("**/api/mortgages", (route) => route.fulfill(json(MORTGAGE_LIST)));
}

const CHECKED_OUTLOOK = {
  mortgage_id: MORTGAGE_ID,
  property_id: PROPERTY_ID,
  property_name: "E2E Peerless",
  lender: "E2E Credit Union",
  rate_type: "fixed",
  current_rate_pct: "8.250",
  current_balance_cents: 33613735,
  is_checkable: true,
  unavailable_reason: null,
  verdict: "worth_pricing",
  survey_rate_pct: "6.67",
  survey_term_months: 360,
  survey_observed_on: "2026-08-13",
  comparable_rate_low_pct: "7.07",
  comparable_rate_high_pct: "7.52",
  remaining_term_months: 343,
  current_payment_cents: 252_600,
  new_payment_low_cents: 224_500,
  new_payment_high_cents: 234_900,
  monthly_saving_low_cents: 17_700,
  monthly_saving_high_cents: 28_100,
  closing_cost_low_cents: 672_275,
  closing_cost_high_cents: 1_680_687,
  breakeven_low_months: 24,
  breakeven_high_months: 34,
};

const BLOCKED_OUTLOOK = {
  ...CHECKED_OUTLOOK,
  mortgage_id: BLOCKED_MORTGAGE_ID,
  property_id: BLOCKED_PROPERTY_ID,
  property_name: "E2E Unclassified",
  is_checkable: false,
  unavailable_reason: UNCLASSIFIED_REASON,
  verdict: "not_checkable",
  survey_rate_pct: null,
  comparable_rate_low_pct: null,
  comparable_rate_high_pct: null,
  monthly_saving_low_cents: null,
  monthly_saving_high_cents: null,
  breakeven_low_months: null,
  breakeven_high_months: null,
};

const RATE_WATCH_RESPONSE = {
  outlooks: [CHECKED_OUTLOOK, BLOCKED_OUTLOOK],
  survey_30_year_pct: "6.67",
  survey_15_year_pct: "5.96",
  survey_observed_on: "2026-08-13",
  checked_mortgage_count: 1,
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
  await stubMortgagesList(page);
  await page.route("**/api/properties", (route) => route.fulfill(json(PROPERTIES)));
});

test.describe("Check for better rates", () => {
  test("checks only when asked, then shows the outlook with its caveats", async ({
    page,
  }) => {
    let watchRequests = 0;
    await page.route("**/api/mortgage-market/rate-watch*", async (route) => {
      watchRequests += 1;
      // Held long enough for the skeleton to be observable on the one click.
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill(json(RATE_WATCH_RESPONSE));
    });

    await page.goto("/mortgages");

    // Loading the page must not reach the survey on its own.
    await expect(page.getByTestId("mortgage-rate-watch-idle")).toBeVisible({
      timeout: 15000,
    });
    expect(watchRequests, "feed was hit before the operator asked").toBe(0);

    await page.getByTestId("check-mortgage-rates-button").click();

    const skeleton = page.getByTestId("mortgage-rate-watch-loading");
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await expect(skeleton.locator("ul > li")).toHaveCount(SKELETON_CARD_COUNT);
    await expect(
      skeleton.locator("ul > li").first().locator(".contents"),
    ).toHaveCount(SKELETON_ROW_COUNT);

    const results = page.getByTestId("mortgage-rate-watch-results");
    await expect(results).toBeVisible({ timeout: 15000 });
    expect(watchRequests).toBe(1);

    // The answer comes first, in the operator's own unit. Without it the
    // section is a table of rates the reader has to interpret themselves.
    const verdict = page.getByTestId("mortgage-rate-watch-verdict");
    await expect(verdict).toContainText("E2E Peerless");
    await expect(verdict).toContainText("$177 – $281");
    await expect(page.getByTestId("mortgage-rate-watch-verdict-detail")).toContainText(
      "8.250% against a comparable 7.07% – 7.52%",
    );

    // Every loan is accounted for before the cards are read — "why is only one
    // of my properties here" is a question the page answers before it is asked.
    await expect(page.getByTestId("mortgage-rate-watch-scope")).toContainText(
      "Compared 1 of your 2 loans",
    );
    await expect(page.getByTestId("mortgage-outlook-card")).toHaveCount(2);

    // The arithmetic, in the order it was done. Break-even is last because it
    // is the row that overturns the ones above it.
    const numbers = page.getByTestId("mortgage-outlook-numbers").first();
    await expect(numbers).toContainText("8.250%");
    await expect(numbers).toContainText("7.07% – 7.52%");
    await expect(numbers).toContainText("28 years, 7 months");
    await expect(numbers).toContainText("$6,723 – $16,807");
    await expect(numbers).toContainText("2 years to 2 years, 10 months");

    // The benchmark is cited with its date, and the rental adjustment is named
    // rather than folded silently into the comparable rate.
    const survey = page.getByTestId("mortgage-rate-watch-survey");
    await expect(survey).toContainText("Aug 13, 2026");
    await expect(survey).toContainText("6.67%");
    await expect(survey).toContainText("0.4 to 0.85 points");
    await expect(survey).toContainText("only a lender can give you one");
  });

  test("a loan blocked on occupancy can be unblocked without leaving the page", async ({
    page,
  }) => {
    let watchRequests = 0;
    await page.route("**/api/mortgage-market/rate-watch*", async (route) => {
      watchRequests += 1;
      await route.fulfill(json(RATE_WATCH_RESPONSE));
    });

    let patched: unknown = null;
    await page.route(`**/api/properties/${BLOCKED_PROPERTY_ID}`, async (route) => {
      patched = route.request().postDataJSON();
      await route.fulfill(
        json({ ...PROPERTIES[1], classification: "investment", type: "short_term" }),
      );
    });

    await page.goto("/mortgages");
    await page.getByTestId("check-mortgage-rates-button").click();
    await expect(page.getByTestId("mortgage-rate-watch-results")).toBeVisible({
      timeout: 15000,
    });

    const blockedCard = page
      .getByTestId("mortgage-outlook-card")
      .filter({ hasText: "E2E Unclassified" });
    await expect(
      blockedCard.getByTestId("mortgage-outlook-unavailable"),
    ).toContainText("priced differently");

    // The fix is offered on the card that is blocked, not on another page.
    const fixer = blockedCard.getByTestId("property-occupancy-fixer");
    await expect(fixer).toBeVisible();
    await expect(
      fixer.getByTestId("property-occupancy-save-button"),
    ).toBeDisabled();

    await fixer.getByText("Investment Property").click();
    // A rental row is invalid without a letting type — the table rejects it.
    await expect(fixer.getByTestId("property-occupancy-rental-type")).toBeVisible();
    await fixer.getByTestId("property-occupancy-save-button").click();

    await expect
      .poll(() => patched, { timeout: 10000 })
      .toEqual({ classification: "investment", type: "short_term" });

    // And the check re-runs by itself — having to remember to press the button
    // again is how a loan the operator just unblocked stays blocked.
    await expect.poll(() => watchRequests, { timeout: 10000 }).toBe(2);
  });

  test("the section fits every viewport and keeps a 44px touch target", async ({
    page,
  }) => {
    await page.route("**/api/mortgage-market/rate-watch*", (route) =>
      route.fulfill(json(RATE_WATCH_RESPONSE)),
    );

    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/mortgages");

      const button = page.getByTestId("check-mortgage-rates-button");
      await expect(button).toBeVisible({ timeout: 15000 });
      await button.click();
      await expect(page.getByTestId("mortgage-rate-watch-results")).toBeVisible({
        timeout: 15000,
      });

      expect(
        await hasHorizontalOverflow(page),
        `horizontal overflow at ${size.width}px`,
      ).toBe(false);
    }

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/mortgages");
    const button = page.getByTestId("check-mortgage-rates-button");
    await expect(button).toBeVisible({ timeout: 15000 });
    const box = await button.boundingBox();
    expect(box, "check button has no box").not.toBeNull();
    expect(box!.height, "check button height").toBeGreaterThanOrEqual(44);
  });

  test("a feed outage reads as an outage, not as good news", async ({ page }) => {
    await page.route("**/api/mortgage-market/rate-watch*", (route) =>
      route.fulfill(
        json({
          outlooks: [
            {
              ...CHECKED_OUTLOOK,
              is_checkable: false,
              verdict: "not_checkable",
              unavailable_reason: FEED_DOWN_REASON,
              survey_rate_pct: null,
              survey_observed_on: null,
              monthly_saving_low_cents: null,
              monthly_saving_high_cents: null,
            },
          ],
          survey_30_year_pct: null,
          survey_15_year_pct: null,
          survey_observed_on: null,
          checked_mortgage_count: 0,
          feed_unavailable_reason: FEED_DOWN_REASON,
        }),
      ),
    );

    await page.goto("/mortgages");
    await page.getByTestId("check-mortgage-rates-button").click();

    const results = page.getByTestId("mortgage-rate-watch-results");
    await expect(results).toContainText("couldn't be reached");
    // The loan is still listed, saying why nothing was measured on it.
    await expect(page.getByTestId("mortgage-outlook-unavailable")).toContainText(
      "nothing was checked",
    );
    // And no verdict at all — an all-clear here would be a claim about a
    // comparison that never ran.
    await expect(page.getByTestId("mortgage-rate-watch-verdict")).toHaveCount(0);
    // No benchmark is published either — there was nothing to measure against.
    await expect(page.getByTestId("mortgage-rate-watch-survey")).toHaveCount(0);
  });

  test("a request failure keeps the blame off the loans", async ({ page }) => {
    await page.route("**/api/mortgage-market/rate-watch*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "mortgage_rate_feed_unavailable" }),
      }),
    );

    await page.goto("/mortgages");
    await page.getByTestId("check-mortgage-rates-button").click();

    await expect(page.getByTestId("mortgage-rate-watch-error")).toContainText(
      "Nothing is wrong with your loans",
    );
  });
});
