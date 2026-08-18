/**
 * No-backend E2E for the "Find a better plan" section.
 *
 * Fully mocks the API surface via page.route() so it runs under
 * playwright.layout.config.ts in the `frontend-layout-e2e` CI job (no backend,
 * no globalSetup) — the same shape welcome-manuals-layout-mock.spec.ts uses.
 *
 * Mocking is not a compromise here: the upstream source is Power to Choose, a
 * live public marketplace outside this repo's control. Asserting against
 * whatever it happens to be offering the morning the suite runs would test the
 * Texas electricity market, not this code. What is exercised is ours —
 * the search is explicit, the skeleton matches the loaded shape, the rating
 * gate is visible, a teaser is labelled, and a feed outage reads as an outage.
 *
 * Verifies:
 *   - Loading the page does not call the external feed; only a click does.
 *   - Skeleton group/row counts mirror the loaded section (no layout shift).
 *   - The current plan is on screen, and each offer reads as a movement from it.
 *   - The withheld-for-poor-rating count is stated, not silently applied.
 *   - A bill-credit teaser carries its caveat.
 *   - Time-of-use plans are listed apart, with terms and no savings figure.
 *   - No horizontal scroll across mobile / tablet / desktop; 44px touch target.
 *     The time-of-use fixture carries a full-length REP name on purpose —
 *     "CHAMPION ENERGY SERVICES LLC" in an enrol label is what pushed 13px of
 *     horizontal scroll onto the page before the label was allowed to wrap.
 *   - A 503 from the feed renders "nothing is wrong with your plans".
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "00000000-0000-0000-0000-000000000010";
const PROPERTY_ID = "00000000-0000-0000-0000-0000000000c1";

/** Matches ``BetterPlansSkeleton``: two property cards, three candidates each. */
const SKELETON_GROUP_COUNT = 2;
const SKELETON_ROWS_PER_GROUP = 3;

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
}

/**
 * The rest of the Utility Plans page. Routed before the offers stub would be
 * wrong — `**\/api/utility-plans*` stops at the next `/`, so it never swallows
 * `/utility-plans/offers`, but the two sibling literal routes below would.
 */
async function stubUtilityPage(page: Page): Promise<void> {
  await page.route("**/api/utility-plans/renewal-alerts*", (route) =>
    route.fulfill(json({ expiring_count: 0, expired_count: 0, plans: [] })),
  );
  await page.route("**/api/utility-plans/rate-comparison*", (route) =>
    route.fulfill(json({ rows: [], benchmarks: [] })),
  );
  await page.route("**/api/market-rate-benchmarks*", (route) => route.fulfill(json([])));
  await page.route("**/api/utility-plans?*", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/utility-plans", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
}

const OFFERS_RESPONSE = {
  groups: [
    {
      property_id: PROPERTY_ID,
      property_name: "E2E Peerless",
      zip_code: "77021",
      current_provider_name: "Constellation",
      current_price_cents_per_kwh_at_1000: "15.6600",
      switch_cost_cents: 15000,
      offers: [
        {
          external_plan_id: 501,
          provider_name: "Veteran Energy",
          plan_name: "Basic 12",
          term_months: 12,
          price_cents_per_kwh_at_500: "11.1000",
          price_cents_per_kwh_at_1000: "10.5000",
          price_cents_per_kwh_at_2000: "10.2000",
          renewable_pct: 24,
          provider_rating: 3,
          jd_power_rating: null,
          cancellation_fee_cents: 15000,
          cancellation_fee_is_per_remaining_month: false,
          is_teaser_priced: false,
          annual_saving_cents: 61920,
          is_time_of_use: false,
          special_terms: null,
          fact_sheet_url: "https://example.test/efl.pdf",
          enroll_url: "https://example.test/enroll",
        },
        {
          external_plan_id: 502,
          provider_name: "AP Gas & Electric",
          plan_name: "Credit 12",
          term_months: 12,
          price_cents_per_kwh_at_500: "19.2000",
          price_cents_per_kwh_at_1000: "6.2000",
          price_cents_per_kwh_at_2000: "12.2000",
          renewable_pct: null,
          provider_rating: 3,
          jd_power_rating: null,
          cancellation_fee_cents: 2000,
          cancellation_fee_is_per_remaining_month: true,
          is_teaser_priced: true,
          annual_saving_cents: 113520,
          is_time_of_use: false,
          special_terms: null,
          fact_sheet_url: null,
          enroll_url: null,
        },
      ],
      withheld_low_rated_count: 33,
      // Champion's Free Weekends-24, the shape this section exists for: a
      // five-star plan whose blended rate loses to the flat offers above it,
      // and which is worth reading anyway.
      time_of_use_offers: [
        {
          external_plan_id: 601,
          provider_name: "CHAMPION ENERGY SERVICES LLC",
          plan_name: "Free Weekends-24",
          term_months: 24,
          price_cents_per_kwh_at_500: "13.5000",
          price_cents_per_kwh_at_1000: "12.8000",
          price_cents_per_kwh_at_2000: "12.4000",
          renewable_pct: 22,
          provider_rating: 5,
          jd_power_rating: null,
          cancellation_fee_cents: 15000,
          cancellation_fee_is_per_remaining_month: false,
          is_teaser_priced: false,
          annual_saving_cents: null,
          is_time_of_use: true,
          special_terms:
            "Free power from 12 midnight Friday night to 11:59 PM Sunday night.",
          fact_sheet_url: "https://example.test/efl-tou.pdf",
          enroll_url: "https://example.test/enroll-tou",
        },
      ],
      withheld_low_rated_time_of_use_count: 5,
      unavailable_reason: null,
    },
  ],
  reference_annual_kwh: 12000,
  has_any_offers: true,
};

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.beforeEach(async ({ page }) => {
  await plantAuth(page);
  await stubShell(page);
  await stubUtilityPage(page);
});

test.describe("Find a better plan", () => {
  test("searches only when asked, then shows the market with its caveats", async ({
    page,
  }) => {
    let offerRequests = 0;
    await page.route("**/api/utility-plans/offers*", async (route) => {
      offerRequests += 1;
      // Held long enough for the skeleton to be observable on the one click.
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill(json(OFFERS_RESPONSE));
    });

    await page.goto("/utility-plans");

    // Loading the page must not reach an external marketplace on its own.
    await expect(page.getByTestId("better-plans-idle")).toBeVisible({ timeout: 15000 });
    expect(offerRequests, "feed was hit before the operator asked").toBe(0);

    await page.getByTestId("find-better-plans-button").click();

    const skeleton = page.getByTestId("better-plans-loading");
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await expect(skeleton.locator("section")).toHaveCount(SKELETON_GROUP_COUNT);
    await expect(skeleton.locator("li")).toHaveCount(
      SKELETON_GROUP_COUNT * SKELETON_ROWS_PER_GROUP,
    );

    const results = page.getByTestId("better-plans-results");
    await expect(results).toBeVisible({ timeout: 15000 });
    expect(offerRequests).toBe(1);

    // What the property holds today — the thing every figure is measured from.
    const equipped = page.getByTestId(`equipped-plan-${PROPERTY_ID}`);
    await expect(equipped).toContainText("Constellation");
    await expect(equipped).toContainText("15.66¢/kWh");
    await expect(equipped).toContainText("$1,879");

    // The recommendation, stated as a movement rather than a listing: the
    // headline saving, then the two stats that moved to produce it.
    const topOffer = page.getByTestId("better-plan-501");
    await expect(topOffer).toContainText("Veteran Energy");
    await expect(topOffer).toContainText("$619");
    await expect(topOffer).toContainText("less per year than now");
    await expect(topOffer).toContainText("5.16¢ less");
    await expect(topOffer).toContainText("3/5");

    // A cheaper headline that only holds in one usage band says so.
    await expect(page.getByTestId("better-plan-teaser-502")).toContainText(
      "only holds near 1,000 kWh",
    );

    // The rating gate is stated, not silently applied.
    await expect(page.getByTestId(`better-plans-withheld-${PROPERTY_ID}`)).toContainText(
      "33 cheaper offers hidden",
    );

    // A saving is arithmetic at a stated usage, not a bill promise.
    await expect(results).toContainText("12,000 kWh per year");

    // Time-of-use plans sit in their own list, below the ranked ones.
    const timeOfUse = page.getByTestId(`time-of-use-offers-${PROPERTY_ID}`);
    await expect(timeOfUse).toContainText("Plans that price by time of day");
    await expect(timeOfUse).toContainText("nothing here carries a savings figure");

    const freeWeekends = page.getByTestId("time-of-use-plan-601");
    await expect(freeWeekends).toContainText("CHAMPION ENERGY SERVICES LLC");
    await expect(freeWeekends).toContainText("12 midnight Friday night");
    await expect(freeWeekends).toContainText("12.80¢ average");
    await expect(freeWeekends).toContainText("24 months");

    // The invariant the whole section rests on: no money is promised here.
    await expect(freeWeekends).not.toContainText("less per year than now");
    await expect(freeWeekends).not.toContainText("Best value");

    await expect(
      page.getByTestId(`time-of-use-withheld-${PROPERTY_ID}`),
    ).toContainText("5 more plans hidden");
  });

  test("the section fits every viewport and keeps a 44px touch target", async ({
    page,
  }) => {
    await page.route("**/api/utility-plans/offers*", (route) =>
      route.fulfill(json(OFFERS_RESPONSE)),
    );

    for (const size of [
      { width: 375, height: 800 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/utility-plans");

      const button = page.getByTestId("find-better-plans-button");
      await expect(button).toBeVisible({ timeout: 15000 });
      await button.click();
      await expect(page.getByTestId("better-plans-results")).toBeVisible({
        timeout: 15000,
      });

      expect(
        await hasHorizontalOverflow(page),
        `horizontal overflow at ${size.width}px`,
      ).toBe(false);

      // The enrol link is the action the whole comparison exists to enable, so
      // it has to stay tappable at every width, not just the button above it.
      for (const testId of [
        "better-plan-enroll-501",
        "time-of-use-enroll-601",
      ]) {
        const enroll = page.getByTestId(testId);
        const enrollBox = await enroll.boundingBox();
        expect(enrollBox, `${testId} has no box at ${size.width}px`).not.toBeNull();
        expect(
          enrollBox!.height,
          `${testId} height at ${size.width}px`,
        ).toBeGreaterThanOrEqual(44);
      }
    }

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/utility-plans");
    const button = page.getByTestId("find-better-plans-button");
    await expect(button).toBeVisible({ timeout: 15000 });
    const box = await button.boundingBox();
    expect(box, "search button has no box").not.toBeNull();
    expect(box!.height, "search button height").toBeGreaterThanOrEqual(44);
  });

  test("a feed outage reads as a feed outage, not as a bad rate", async ({ page }) => {
    await page.route("**/api/utility-plans/offers*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "offer_feed_unavailable" }),
      }),
    );

    await page.goto("/utility-plans");
    await page.getByTestId("find-better-plans-button").click();

    await expect(page.getByTestId("better-plans-error")).toContainText(
      "Nothing is wrong with your plans",
    );
  });
});
