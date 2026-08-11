import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Rate-benchmark full-flow behavioural E2E.
 *
 * Drives the real journey the feature exists for: a plan comfortably inside its
 * term — so the renewal card says nothing about it — gets flagged once a market
 * rate is recorded through the dialog. That is the gap this feature closes; a
 * lapsed plan would have been caught by the renewal card already.
 *
 * Verifies UI state AND backend state via the public API, and cleans up every
 * seeded row in `finally` per the project's "never leave test data" rule.
 *
 * The benchmark is org-scoped and this account is shared with the sibling
 * utility specs, so every assertion targets the seeded plan's own row rather
 * than a total, and the benchmark is deleted on the way out.
 */

interface BenchmarkRow {
  id: string;
  service_type: string;
  rate_cents_per_kwh: string | null;
  monthly_cents: number | null;
  source: string | null;
  observed_on: string;
  is_stale: boolean;
}

interface ComparisonRow {
  plan: { id: string; provider_name: string };
  status: string;
  plan_figure: string | null;
  benchmark_figure: string | null;
  gap_pct: string | null;
  benchmark_is_stale: boolean;
}

interface Comparison {
  material_gap_pct: number;
  above_market: ComparisonRow[];
  not_compared: ComparisonRow[];
  total_above_market: number;
  has_stale_benchmark: boolean;
}

/** ``offsetDays`` from today as ``YYYY-MM-DD``. Negative is in the past. */
function isoDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function seedPlan(
  api: APIRequestContext,
  propertyId: string,
  providerName: string,
): Promise<string> {
  const res = await api.post("/utility-plans", {
    data: {
      property_id: propertyId,
      service_type: "electricity",
      provider_name: providerName,
      rate_type: "fixed",
      plan_name: "12 Month Fixed",
      avg_price_cents_per_kwh_at_1000: "15.0600",
      term_months: 12,
      // Well inside its term: the renewal card has nothing to say here, which
      // is exactly the blind spot the comparison covers.
      service_start_date: isoDateOffset(-60),
      term_end_date: isoDateOffset(300),
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPlan failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).id;
}

async function fetchComparison(api: APIRequestContext): Promise<Comparison> {
  const res = await api.get("/utility-plans/rate-comparison");
  if (!res.ok()) {
    throw new Error(`fetchComparison failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

async function fetchBenchmarks(api: APIRequestContext): Promise<BenchmarkRow[]> {
  const res = await api.get("/market-rate-benchmarks");
  if (!res.ok()) {
    throw new Error(`fetchBenchmarks failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

async function waitForListPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Utility Plans" })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Utility plan rate benchmark", () => {
  test("record a market rate, see an in-term plan flagged as above market, remove it", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const providerName = `E2E Benchmark Power ${runId}`;
    let propertyId: string | null = null;
    let planId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Benchmark Property ${runId}`,
      });
      propertyId = property.id;
      planId = await seedPlan(api, propertyId, providerName);

      // ── Before any benchmark: nothing is being checked ───────────────────
      const before = await fetchComparison(api);
      expect(before.above_market.some((r) => r.plan.id === planId)).toBe(false);
      // The plan is surfaced as unmeasured rather than silently dropped.
      expect(
        before.not_compared.find((r) => r.plan.id === planId)?.status,
      ).toBe("no_benchmark");

      await page.goto("/utility-plans");
      await waitForListPage(page);
      // Scoped to electricity rather than asserting the summary is empty: the
      // account is shared with the sibling comparison-layout spec, which writes
      // an `internet` benchmark, and a global empty-state assertion would fail
      // purely because that file happened to run alongside this one.
      await expect(page.getByTestId("market-rate-electricity")).toBeHidden();

      // ── Record the market rate through the dialog ────────────────────────
      await page.getByTestId("record-market-rate-button").click();
      await expect(page.getByTestId("market-rate-benchmark-dialog")).toBeVisible();

      await page.getByTestId("benchmark-figure").fill("11.1");
      await page
        .getByTestId("benchmark-source")
        .fill(`Power to Choose 77021 ${runId}`);
      await page.getByTestId("utility-plan-save-button").click();
      benchmarkRecorded = true;

      await expect(page.getByTestId("market-rate-benchmark-dialog")).toBeHidden({
        timeout: 15000,
      });

      // Backend state, not just the UI: the rate landed in the metered shape.
      const benchmarks = await fetchBenchmarks(api);
      const electricity = benchmarks.find((b) => b.service_type === "electricity");
      expect(electricity, "no electricity benchmark was saved").toBeTruthy();
      expect(Number(electricity!.rate_cents_per_kwh)).toBeCloseTo(11.1, 4);
      expect(electricity!.monthly_cents).toBeNull();
      expect(electricity!.is_stale).toBe(false);

      // ── The plan is now measured and flagged ────────────────────────────
      const after = await fetchComparison(api);
      const row = after.above_market.find((r) => r.plan.id === planId);
      expect(row, "the seeded plan was not flagged as above market").toBeTruthy();
      expect(row!.status).toBe("above_market");
      // 15.06 against 11.10 is ~35.7% — well past the materiality threshold.
      expect(Number(row!.gap_pct)).toBeGreaterThan(after.material_gap_pct);

      // ── The list page reflects what it is comparing against ─────────────
      await page.reload();
      await waitForListPage(page);
      await expect(page.getByTestId("market-rate-electricity")).toContainText(
        "11.1¢/kWh",
      );

      // ── The dashboard card names the plan ───────────────────────────────
      await page.goto("/");
      const card = page.getByTestId("utility-plan-comparison-card");
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId(`utility-plan-comparison-${planId}`)).toContainText(
        "paying 15.06¢/kWh vs market 11.1¢/kWh",
      );
      await expect(
        page.getByTestId(`utility-plan-comparison-gap-${planId}`),
      ).toContainText("above market");

      // ── Removing the benchmark stops the flag ───────────────────────────
      const deleted = await api.delete("/market-rate-benchmarks/electricity");
      expect(deleted.ok()).toBe(true);
      benchmarkRecorded = false;

      const cleared = await fetchComparison(api);
      expect(cleared.above_market.some((r) => r.plan.id === planId)).toBe(false);
    } finally {
      if (benchmarkRecorded) {
        await api.delete("/market-rate-benchmarks/electricity").catch(() => {});
      }
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("a regulated plan is never flagged, however it is priced", async ({
    api,
  }) => {
    const runId = Date.now();
    let propertyId: string | null = null;
    let planId: string | null = null;
    let benchmarkRecorded = false;

    try {
      const property = await createProperty(api, {
        name: `E2E Regulated Property ${runId}`,
      });
      propertyId = property.id;

      const planRes = await api.post("/utility-plans", {
        data: {
          property_id: propertyId,
          service_type: "natural_gas",
          provider_name: `E2E CenterPoint ${runId}`,
          // A tariffed monopoly: telling the operator it is above market would
          // be advice they cannot act on.
          rate_type: "regulated",
          avg_price_cents_per_kwh_at_1000: "99.0000",
          service_start_date: isoDateOffset(-60),
        },
      });
      expect(planRes.ok()).toBe(true);
      planId = (await planRes.json()).id;

      const benchRes = await api.put("/market-rate-benchmarks/natural_gas", {
        data: {
          rate_cents_per_kwh: "1.0000",
          source: `E2E regulated check ${runId}`,
          observed_on: isoDateOffset(0),
        },
      });
      expect(benchRes.ok()).toBe(true);
      benchmarkRecorded = true;

      const comparison = await fetchComparison(api);
      expect(comparison.above_market.some((r) => r.plan.id === planId)).toBe(false);
      expect(
        comparison.not_compared.find((r) => r.plan.id === planId)?.status,
      ).toBe("not_comparable");
    } finally {
      if (benchmarkRecorded) {
        await api.delete("/market-rate-benchmarks/natural_gas").catch(() => {});
      }
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("the API rejects a benchmark that carries both shapes", async ({ api }) => {
    // The DB CHECK is the real guarantee; this pins that it surfaces as a
    // readable 422 rather than an IntegrityError 500.
    const res = await api.put("/market-rate-benchmarks/electricity", {
      data: {
        rate_cents_per_kwh: "11.1000",
        monthly_cents: 6000,
        observed_on: isoDateOffset(0),
      },
    });
    expect(res.status()).toBe(422);
  });
});
