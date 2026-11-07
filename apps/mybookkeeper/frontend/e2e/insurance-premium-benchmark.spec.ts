import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { createProperty } from "./fixtures/seed-data";
import { seededOrg } from "./fixtures/seeded-org";
import { localDateOffset, localToday } from "./fixtures/local-today";

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
 * Verifies UI state AND backend state via the public API. The benchmark is a
 * singleton per organization, and the first test needs there to be none, so the
 * file has an organization of its own and runs its tests in order. Deleting the
 * organization afterwards removes everything they seeded.
 */

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

async function seedPolicy(
  api: APIRequestContext,
  propertyId: string,
  data: { policy_name: string; premium_cents: number; coverage_amount_cents: number },
): Promise<string> {
  const res = await api.post("/insurance-policies", {
    data: {
      property_id: propertyId,
      carrier: "E2E Mutual",
      premium_frequency: "annual",
      // Years from expiry: the expiration badge has nothing to say here, which
      // is exactly the blind spot the premium check covers.
      effective_date: localDateOffset(-30),
      expiration_date: localDateOffset(335),
      ...data,
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPolicy failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function fetchComparison(api: APIRequestContext): Promise<Comparison> {
  const res = await api.get("/insurance-policies/premium-comparison", {
    params: { today: localToday() },
  });
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

test.describe.configure({ mode: "serial" });

test.describe("Insurance premium benchmark", () => {
  const org = seededOrg("insurance-benchmark");

  test("record a market premium, see the overpriced policy flagged per $1,000 of coverage, remove it", async ({ page }) => {
    const { api } = org();
    await org().signIn(page);
    const runId = Date.now();
    const pricey = `E2E Overpriced Policy ${runId}`;
    const fair = `E2E Fairly Priced Policy ${runId}`;

    const property = await createProperty(api, {
      name: `E2E Benchmark Insurance Property ${runId}`,
    });
    const propertyId = property.id;
    // Same premium, different dwelling amounts. Raw they are identical; per
    // $1,000 of coverage one is 600¢ and the other 300¢.
    const priceyId = await seedPolicy(api, propertyId, {
      policy_name: pricey,
      premium_cents: 240_000,
      coverage_amount_cents: 40_000_000,
    });
    const fairId = await seedPolicy(api, propertyId, {
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

    await expect(page.getByTestId("insurance-benchmark-summary-empty")).toBeVisible({
      timeout: 15000,
    });
    const cleared = await fetchComparison(api);
    expect(cleared.benchmark).toBeNull();
    expect(cleared.above_market.some((r) => r.policy.id === priceyId)).toBe(false);
  });

  test("a policy with no coverage amount is reported as unmeasurable, not as fine", async () => {
    const { api } = org();
    // Without the dwelling amount the premium cannot be normalised. Dropping it
    // silently would let the operator read the all-clear as covering it.
    const runId = Date.now();

    const property = await createProperty(api, {
      name: `E2E Unmeasurable Property ${runId}`,
    });
    const propertyId = property.id;
    const created = await api.post("/insurance-policies", {
      data: {
        property_id: propertyId,
        policy_name: `E2E Coverage-less Policy ${runId}`,
        premium_cents: 240_000,
        premium_frequency: "annual",
      },
    });
    expect(created.ok()).toBe(true);
    const policyId = ((await created.json()) as { id: string }).id;

    const benchRes = await api.put("/insurance-benchmarks", {
      data: {
        today: localToday(),
        annual_premium_cents: 120_000,
        coverage_amount_cents: 40_000_000,
        observed_on: localDateOffset(0),
      },
    });
    expect(benchRes.ok()).toBe(true);

    const comparison = await fetchComparison(api);
    expect(comparison.above_market.some((r) => r.policy.id === policyId)).toBe(false);
    expect(
      comparison.not_compared.find((r) => r.policy.id === policyId)?.status,
    ).toBe("not_comparable");
  });

  test("the API refuses a premium recorded without the coverage it bought", async () => {
    const { api } = org();
    // It could never be normalised, so it would match nothing — and the
    // operator would believe their policies were being checked.
    const premiumOnly = await api.put("/insurance-benchmarks", {
      data: {
        today: localToday(),
        annual_premium_cents: 120_000,
        observed_on: localDateOffset(0),
      },
    });
    expect(premiumOnly.status()).toBe(422);

    const coverageOnly = await api.put("/insurance-benchmarks", {
      data: {
        today: localToday(),
        coverage_amount_cents: 40_000_000,
        observed_on: localDateOffset(0),
      },
    });
    expect(coverageOnly.status()).toBe(422);

    // A future observation date is a typo, and it would never age into
    // staleness — the one signal that tells the operator to look again.
    const future = await api.put("/insurance-benchmarks", {
      data: {
        today: localToday(),
        annual_premium_cents: 120_000,
        coverage_amount_cents: 40_000_000,
        observed_on: localDateOffset(7),
      },
    });
    expect(future.status()).toBe(422);
  });
});
