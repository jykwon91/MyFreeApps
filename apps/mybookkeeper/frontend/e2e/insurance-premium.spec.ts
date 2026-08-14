import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Insurance premium capture — full-flow behavioural E2E.
 *
 * Drives the real journey: record a policy with its premium through the dialog
 * on the Insurance page, against the property it insures → the annualised
 * figure appears in the all-policies list → the detail page breaks out billed
 * vs annualised vs deductibles → edit the premium at renewal and watch every
 * derived figure move with it.
 *
 * The premium is deliberately seeded as a MONTHLY amount. A monthly premium
 * shown or compared as if it were annual understates the yearly cost by 12x,
 * which is the specific failure the frequency column exists to prevent — an
 * annually-billed policy would exercise none of it.
 *
 * Verifies UI state AND backend state via the public API, and cleans up every
 * seeded row in `finally` per the project's "never leave test data" rule.
 */

interface InsurancePolicyRow {
  id: string;
  policy_name: string;
  premium_cents: number | null;
  premium_frequency: string | null;
  annual_premium_cents: number | null;
  deductible_cents: number | null;
  wind_hail_deductible_pct: string | null;
  coverage_amount_cents: number | null;
  notes: string | null;
}

async function fetchPolicy(
  api: APIRequestContext,
  id: string,
): Promise<InsurancePolicyRow> {
  const res = await api.get(`/insurance-policies/${id}`);
  if (!res.ok()) {
    throw new Error(`fetchPolicy failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

async function waitForInsurancePage(page: Page): Promise<void> {
  await page.goto("/insurance-policies");
  await expect(page.getByTestId("add-insurance-policy-button")).toBeVisible({
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Insurance premium capture", () => {
  test("record a monthly premium, see it annualised everywhere, then reprice it", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const propertyName = `E2E Insurance Property ${runId}`;
    const policyName = `E2E Landlord Policy ${runId}`;
    let propertyId: string | null = null;
    let policyId: string | null = null;

    try {
      const property = await createProperty(api, {
        name: propertyName,
        address: `${runId} Peerless St, Houston, TX 77021`,
      });
      propertyId = property.id;

      // 1) CREATE through the dialog, premium billed monthly.
      await waitForInsurancePage(page);
      await page.getByTestId("add-insurance-policy-button").click();
      await expect(page.getByTestId("add-insurance-policy-dialog")).toBeVisible();

      await page
        .getByTestId("insurance-policy-property-select")
        .selectOption(propertyId);
      await page.getByTestId("insurance-policy-name-input").fill(policyName);
      await page.getByTestId("insurance-carrier-input").fill("E2E Mutual");
      await page.getByTestId("insurance-policy-number-input").fill("POL-E2E-1");
      await page.getByTestId("insurance-coverage-input").fill("500000");
      await page.getByTestId("insurance-premium-input").fill("112");
      await page
        .getByTestId("insurance-premium-frequency-select")
        .selectOption("monthly");
      await page.getByTestId("insurance-deductible-input").fill("2500");
      await page.getByTestId("insurance-wind-hail-input").fill("2");
      await page.getByTestId("insurance-policy-save-button").click();

      await expect(page.getByTestId("add-insurance-policy-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      const row = page.locator('[data-testid^="insurance-policy-item-"]', {
        hasText: policyName,
      });
      await expect(row).toBeVisible({ timeout: 10000 });
      const testId = await row.getAttribute("data-testid");
      policyId = testId?.replace("insurance-policy-item-", "") ?? null;
      expect(policyId).toBeTruthy();
      if (!policyId) throw new Error("Could not parse policy id from the row");

      // The row names the building. Policy names alone cannot tell three
      // near-identical houses apart, which is the whole point of the column.
      await expect(
        page.getByTestId(`insurance-policy-property-${policyId}`),
      ).toHaveText(propertyName);

      // 2) The backend stored the amount as billed — unannualised — with the
      //    period beside it, and derived the yearly total itself.
      const saved = await fetchPolicy(api, policyId);
      expect(saved.premium_cents).toBe(11200);
      expect(saved.premium_frequency).toBe("monthly");
      expect(saved.annual_premium_cents).toBe(134400);
      expect(saved.deductible_cents).toBe(250000);
      expect(Number(saved.wind_hail_deductible_pct)).toBeCloseTo(2, 2);

      // 3) The all-policies list shows the ANNUALISED figure. Rows share one
      //    column, so a monthly amount printed next to an annual one would
      //    make the pricier policy read as the cheaper one.
      await page.goto("/insurance-policies");
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByTestId(`insurance-policy-premium-${policyId}`),
      ).toHaveText("$1,344/yr", { timeout: 10000 });

      // 4) The detail page keeps both figures: billed stays reconcilable
      //    against the declarations page, annualised drives comparison.
      await page.getByTestId(`insurance-policy-item-${policyId}`).click();
      await expect(page.getByTestId("insurance-policy-cost")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId("insurance-premium")).toHaveText("$112/mo");
      await expect(page.getByTestId("insurance-annual-premium")).toHaveText(
        "$1,344/yr",
      );
      await expect(page.getByTestId("insurance-deductible")).toHaveText("$2,500");
      // 2% reads as small until it is priced against the dwelling.
      await expect(page.getByTestId("insurance-wind-hail-deductible")).toHaveText(
        "2% of coverage ($10,000.00)",
      );

      // 5) EDIT at renewal: the carrier reprices and moves to annual billing.
      await page.getByTestId("edit-insurance-policy-button").click();
      await expect(page.getByTestId("edit-insurance-policy-dialog")).toBeVisible();
      // Prefilled from the stored row, not blank.
      await expect(page.getByTestId("insurance-policy-name-input")).toHaveValue(
        policyName,
        { timeout: 10000 },
      );
      await expect(page.getByTestId("insurance-premium-input")).toHaveValue("112");
      await expect(
        page.getByTestId("insurance-premium-frequency-select"),
      ).toHaveValue("monthly");

      await page.getByTestId("insurance-premium-input").fill("1380");
      await page
        .getByTestId("insurance-premium-frequency-select")
        .selectOption("annual");
      await page.getByTestId("insurance-policy-update-button").click();

      await expect(page.getByTestId("edit-insurance-policy-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      // 6) Every derived figure moved with it.
      await expect(page.getByTestId("insurance-premium")).toHaveText("$1,380/yr", {
        timeout: 10000,
      });
      await expect(page.getByTestId("insurance-annual-premium")).toHaveText(
        "$1,380/yr",
      );

      const repriced = await fetchPolicy(api, policyId);
      expect(repriced.premium_cents).toBe(138000);
      expect(repriced.premium_frequency).toBe("annual");
      expect(repriced.annual_premium_cents).toBe(138000);
      // Nothing the edit did not touch was erased.
      expect(repriced.policy_name).toBe(policyName);
      expect(repriced.coverage_amount_cents).toBe(50000000);
      expect(repriced.deductible_cents).toBe(250000);
    } finally {
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("a policy recorded without a premium reads as unpriced, not as free", async ({
    authedPage: page,
    api,
  }) => {
    // Coverage-only policies predate the premium columns. They must show a
    // dash — a $0 would say the operator is insured for nothing.
    const runId = Date.now();
    const propertyName = `E2E Unpriced Property ${runId}`;
    const policyName = `E2E Unpriced Policy ${runId}`;
    let propertyId: string | null = null;
    let policyId: string | null = null;

    try {
      const property = await createProperty(api, { name: propertyName });
      propertyId = property.id;

      const created = await api.post("/insurance-policies", {
        data: {
          property_id: propertyId,
          policy_name: policyName,
          carrier: "E2E Mutual",
          coverage_amount_cents: 50000000,
        },
      });
      expect(created.ok()).toBe(true);
      policyId = ((await created.json()) as InsurancePolicyRow).id;

      await page.goto("/insurance-policies");
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId(`insurance-policy-item-${policyId}`)).toBeVisible({
        timeout: 10000,
      });
      // No premium line at all rather than a placeholder in the list.
      await expect(
        page.getByTestId(`insurance-policy-premium-${policyId}`),
      ).toHaveCount(0);

      await page.goto(`/insurance-policies/${policyId}`);
      await expect(page.getByTestId("insurance-policy-cost")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId("insurance-premium")).toHaveText("—");
      await expect(page.getByTestId("insurance-annual-premium")).toHaveText("—");
      await expect(page.getByTestId("insurance-deductible")).toHaveText("—");
      await expect(page.getByTestId("insurance-wind-hail-deductible")).toHaveText("—");
      // Coverage is still recorded — only the cost side is blank.
      await expect(page.getByTestId("insurance-coverage-amount")).toHaveText(
        "$500,000",
      );
    } finally {
      if (policyId) await api.delete(`/insurance-policies/${policyId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("a premium amount without a billing period is rejected", async ({ api }) => {
    // Without the period the amount is uninterpretable, so the API refuses the
    // half-set pair rather than assuming one.
    const runId = Date.now();
    let propertyId: string | null = null;

    try {
      const property = await createProperty(api, { name: `E2E Pair Property ${runId}` });
      propertyId = property.id;

      const amountOnly = await api.post("/insurance-policies", {
        data: {
          property_id: propertyId,
          policy_name: `E2E Pair Policy ${runId}`,
          premium_cents: 11200,
        },
      });
      expect(amountOnly.status()).toBe(422);

      const frequencyOnly = await api.post("/insurance-policies", {
        data: {
          property_id: propertyId,
          policy_name: `E2E Pair Policy ${runId}`,
          premium_frequency: "monthly",
        },
      });
      expect(frequencyOnly.status()).toBe(422);
    } finally {
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
