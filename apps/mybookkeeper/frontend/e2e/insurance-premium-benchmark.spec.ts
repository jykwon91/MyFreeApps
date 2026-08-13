import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Insurance market-premium benchmark — full-flow behavioural E2E.
 *
 * Drives the journey the feature exists for: a policy nowhere near expiry — so
 * the expiration badge says nothing about it — gets flagged as overpriced once a
 * market premium is recorded through the dialog. That is the blind spot this
 * closes; a lapsing policy was already covered.
 *
 * The two policies are deliberately priced the *same* on different dwelling
 * amounts. Compared raw they look identical; normalised per $1,000 of coverage
 * one is double the other, and only one is above market. A comparison that
 * skipped the normalisation would flag both or neither, so this is the assertion
 * that proves the unit is doing real work.
 *
 * Verifies UI state AND backend state via the public API, and cleans up every
 * seeded row in `finally` per the project's "never leave test data" rule. The
 * benchmark is a singleton per organization and this account is shared with the
 * sibling insurance specs, so every assertion targets the seeded policies' own
 * rows rather than a total, and the benchmark is removed on the way out.
 */

interface CreatedListing {
  id: string;
}

interface ComparisonRow {
  policy: { id: string; policy_name: string };
  status: string;
  policy_rate_cents_per_1000: string | null;
  benchmark_rate_cents_per_1000: string | null;
  gap_pct: string | null;
  benchmark_is_stale: boolean;
}

interface Comparison {
  material_gap_pct: number;
  benchmark: { rate_cents_per_1000_coverage: string | null; is_stale: boolean } | null;
  above_market: ComparisonRow[];
  not_compared: ComparisonRow[];
  total_above_market: number;
  total_considered: number;
  has_stale_benchmark: boolean;
}

/** ``offsetDays`` from today as ``YYYY-MM-DD``. Negative is in the past. */
function isoDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function createListing(
  api: APIRequestContext,
  propertyId: string,
  title: string,
): Promise<CreatedListing> {
  const res = await api.post("/listings", {
    data: {
      property_id: propertyId,
      title,
      monthly_rate: "1500.00",
      room_type: "private_room",
      status: "active",
      private_bath: false,
      parking_assigned: false,
      furnished: false,
      pets_on_premises: false,
    },
  });
  if (!res.ok()) {
    throw new Error(`createListing failed: ${res.status()} ${await res.text()}`);
  }
  return { id: ((await res.json()) as { id: string }).id };
}

async function seedPolicy(
  api: APIRequestContext,
  listingId: string,
  data: { policy_name: string; premium_cents: number; coverage_amount_cents: number },
): Promise<string> {
  const res = await api.post("/insurance-policies", {
    data: {
      listing_id: listingId,
      carrier: "E2E Mutual",
      premium_frequency: "annual",
      // Years from expiry: the expiration badge has nothing to say here, which
      // is exactly the blind spot the premium check covers.
      effective_date: isoDateOffset(-30),
      expiration_date: isoDateOffset(335),
      ...data,
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPolicy failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function fetchComparison(api: APIRequestContext): Promise<Comparison> {
  const res = await api.get("/insurance-policies/premium-comparison");
  if (!res.ok()) {
    throw new Error(`fetchComparison failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

async function waitForPoliciesPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Insurance" })).toBeVisible({
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Insurance premium benchmark", () => {
  test("record a market premium, see the overpriced policy flagged per $1,000 of coverage, remove it", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const pricey = `E2E Overpriced Policy ${runId}`;
    const fair = `E2E Fairly Priced Policy ${runId}`;
    let propertyId: string | null = null;
    let listingId: string | null = null;
    let priceyId: string | null = null;
    let fairId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Benchmark Insurance Property ${runId}`,
      });
      propertyId = property.id;
      listingId = (
        await createListing(api, propertyId, `E2E Benchmark Listing ${runId}`)
      ).id;

      // Same premium, different dwelling amounts. Raw they are identical; per
      // $1,000 of coverage one is 600¢ and the other 300¢.
      priceyId = await seedPolicy(api, listingId, {
        policy_name: pricey,
        premium_cents: 240_000,
        coverage_amount_cents: 40_000_000,
      });
      fairId = await seedPolicy(api, listingId, {
        policy_name: fair,
        premium_cents: 240_000,
        coverage_amount_cents: 80_000_000,
      });

      // ── Before any benchmark: nothing is being checked ───────────────────
      const before = await fetchComparison(api);
      expect(before.benchmark).toBeNull();
      expect(before.above_market.some((r) => r.policy.id === priceyId)).toBe(false);
      // The policies are surfaced as unmeasured rather than silently dropped.
      expect(before.not_compared.find((r) => r.policy.id === priceyId)?.status).toBe(
        "no_benchmark",
      );

      await page.goto("/insurance-policies");
      await waitForPoliciesPage(page);
      await expect(page.getByTestId("insurance-benchmark-summary-empty")).toBeVisible();

      // ── Record the market premium through the dialog ────────────────────
      await page.getByTestId("insurance-benchmark-summary-record").click();
      await expect(page.getByTestId("insurance-benchmark-dialog")).toBeVisible();

      // $1,200/yr on $400,000 of dwelling → 300¢ per $1,000.
      await page.getByTestId("insurance-benchmark-premium").fill("1200");
      await page.getByTestId("insurance-benchmark-coverage").fill("400000");
      await page.getByTestId("insurance-benchmark-region").fill("Harris County, TX");
      await page
        .getByTestId("insurance-benchmark-source")
        .fill(`TDI HelpInsure HO-3 ${runId}`);
      await page.getByTestId("insurance-benchmark-save-button").click();
      benchmarkRecorded = true;

      await expect(page.getByTestId("insurance-benchmark-dialog")).toBeHidden({
        timeout: 15000,
      });

      // ── The page now names what it is comparing against ─────────────────
      await expect(page.getByTestId("insurance-benchmark-summary-figure")).toContainText(
        "$1,200/yr on $400,000 of dwelling coverage — $3.00 per $1,000",
        { timeout: 15000 },
      );

      // ── Backend state: normalised, and only the overpriced one flagged ──
      const after = await fetchComparison(api);
      expect(Number(after.benchmark?.rate_cents_per_1000_coverage)).toBeCloseTo(300, 2);

      const flagged = after.above_market.find((r) => r.policy.id === priceyId);
      expect(flagged, "the overpriced policy was not flagged").toBeTruthy();
      expect(flagged!.status).toBe("above_market");
      expect(Number(flagged!.policy_rate_cents_per_1000)).toBeCloseTo(600, 2);
      // 600 against 300 is +100% — comfortably past the materiality threshold.
      expect(Number(flagged!.gap_pct)).toBeGreaterThan(after.material_gap_pct);

      // The identically-priced policy on twice the coverage is NOT flagged.
      // Comparing raw premiums would have flagged both.
      expect(after.above_market.some((r) => r.policy.id === fairId)).toBe(false);
      expect(after.not_compared.some((r) => r.policy.id === fairId)).toBe(false);

      // ── The dashboard card names the policy and both figures ────────────
      await page.goto("/");
      await expect(page.getByTestId("insurance-premium-comparison-card")).toBeVisible({
        timeout: 20000,
      });
      await expect(
        page.getByTestId(`insurance-premium-comparison-${priceyId}`),
      ).toContainText("paying $6.00 per $1,000 vs market $3.00 per $1,000");
      await expect(
        page.getByTestId(`insurance-premium-comparison-gap-${priceyId}`),
      ).toContainText("above market");
      // The one that is priced fine never appears on the card.
      await expect(
        page.getByTestId(`insurance-premium-comparison-${fairId}`),
      ).toHaveCount(0);

      // ── Removing the benchmark stops the flag ───────────────────────────
      await page.goto("/insurance-policies");
      await waitForPoliciesPage(page);
      await page.getByTestId("insurance-benchmark-summary-edit").click();
      await expect(page.getByTestId("insurance-benchmark-dialog")).toBeVisible();
      await page.getByTestId("insurance-benchmark-remove-button").click();
      await expect(page.getByTestId("insurance-benchmark-dialog")).toBeHidden({
        timeout: 15000,
      });
      benchmarkRecorded = false;

      await expect(page.getByTestId("insurance-benchmark-summary-empty")).toBeVisible({
        timeout: 15000,
      });
      const cleared = await fetchComparison(api);
      expect(cleared.benchmark).toBeNull();
      expect(cleared.above_market.some((r) => r.policy.id === priceyId)).toBe(false);
    } finally {
      if (benchmarkRecorded) {
        await api.delete("/insurance-benchmarks").catch(() => {});
      }
      if (priceyId) await api.delete(`/insurance-policies/${priceyId}`).catch(() => {});
      if (fairId) await api.delete(`/insurance-policies/${fairId}`).catch(() => {});
      if (listingId) await api.delete(`/listings/${listingId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("a policy with no coverage amount is reported as unmeasurable, not as fine", async ({
    api,
  }) => {
    // Without the dwelling amount the premium cannot be normalised. Dropping it
    // silently would let the operator read the all-clear as covering it.
    const runId = Date.now();
    let propertyId: string | null = null;
    let listingId: string | null = null;
    let policyId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Unmeasurable Property ${runId}`,
      });
      propertyId = property.id;
      listingId = (
        await createListing(api, propertyId, `E2E Unmeasurable Listing ${runId}`)
      ).id;

      const created = await api.post("/insurance-policies", {
        data: {
          listing_id: listingId,
          policy_name: `E2E Coverage-less Policy ${runId}`,
          premium_cents: 240_000,
          premium_frequency: "annual",
        },
      });
      expect(created.ok()).toBe(true);
      policyId = ((await created.json()) as { id: string }).id;

      const benchRes = await api.put("/insurance-benchmarks", {
        data: {
          annual_premium_cents: 120_000,
          coverage_amount_cents: 40_000_000,
          observed_on: isoDateOffset(0),
        },
      });
      expect(benchRes.ok()).toBe(true);
      benchmarkRecorded = true;

      const comparison = await fetchComparison(api);
      expect(comparison.above_market.some((r) => r.policy.id === policyId)).toBe(false);
      expect(
        comparison.not_compared.find((r) => r.policy.id === policyId)?.status,
      ).toBe("not_comparable");
    } finally {
      if (benchmarkRecorded) {
        await api.delete("/insurance-benchmarks").catch(() => {});
      }
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (listingId) await api.delete(`/listings/${listingId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("the API refuses a premium recorded without the coverage it bought", async ({
    api,
  }) => {
    // It could never be normalised, so it would match nothing — and the
    // operator would believe their policies were being checked.
    const premiumOnly = await api.put("/insurance-benchmarks", {
      data: { annual_premium_cents: 120_000, observed_on: isoDateOffset(0) },
    });
    expect(premiumOnly.status()).toBe(422);

    const coverageOnly = await api.put("/insurance-benchmarks", {
      data: { coverage_amount_cents: 40_000_000, observed_on: isoDateOffset(0) },
    });
    expect(coverageOnly.status()).toBe(422);

    // A future observation date is a typo, and it would never age into
    // staleness — the one signal that tells the operator to look again.
    const future = await api.put("/insurance-benchmarks", {
      data: {
        annual_premium_cents: 120_000,
        coverage_amount_cents: 40_000_000,
        observed_on: isoDateOffset(7),
      },
    });
    expect(future.status()).toBe(422);
  });
});
