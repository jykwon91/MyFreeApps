import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Utility Plans full-flow behavioural E2E.
 *
 * Drives the real user journey: create a plan through the dialog → it appears
 * in the list with a derived renewal status → the dashboard alert card picks
 * it up → the "needs renewing" filter selects on that status → delete.
 *
 * Verifies UI state AND backend state via the public API, and cleans up every
 * seeded row in `finally` per the project's "never leave test data" rule.
 *
 * The plan is seeded with a term that has already lapsed, because the whole
 * point of the feature is catching a fixed rate that quietly rolled onto a
 * variable holdover — an "active" plan would exercise none of that.
 */

interface UtilityPlanRow {
  id: string;
  provider_name: string;
  account_number: string | null;
  plan_name: string | null;
  renewal_status: string;
  is_current: boolean;
  days_until_term_end: number | null;
  term_end_date: string | null;
  tdu_charge_cents_per_kwh: string | null;
  min_usage_fee_cents: number | null;
  min_usage_threshold_kwh: number | null;
  notes: string | null;
}

interface RenewalAlerts {
  window_days: number;
  expired: UtilityPlanRow[];
  expiring_soon: UtilityPlanRow[];
  total_needing_attention: number;
}

/** ``offsetDays`` from today as ``YYYY-MM-DD``. Negative is in the past. */
function isoDateOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function fetchPlan(api: APIRequestContext, id: string): Promise<UtilityPlanRow> {
  const res = await api.get(`/utility-plans/${id}`);
  if (!res.ok()) throw new Error(`fetchPlan failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function fetchAlerts(api: APIRequestContext): Promise<RenewalAlerts> {
  const res = await api.get("/utility-plans/renewal-alerts");
  if (!res.ok()) throw new Error(`fetchAlerts failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function waitForListPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Utility Plans" })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Utility Plans", () => {
  test("create a lapsed plan, see it flagged on the dashboard, filter it, delete it", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const propertyName = `E2E Utility Property ${runId}`;
    const providerName = `E2E Power Co ${runId}`;
    let propertyId: string | null = null;
    let planId: string | null = null;

    try {
      const property = await createProperty(api, {
        name: propertyName,
        address: `${runId} Peerless St, Houston, TX 77021`,
      });
      propertyId = property.id;

      // 1) CREATE through the dialog.
      await page.goto("/utility-plans");
      await waitForListPage(page);

      await page.getByTestId("add-utility-plan-button").click();
      await expect(page.getByTestId("add-utility-plan-dialog")).toBeVisible();

      await page.getByTestId("utility-plan-property-select").selectOption({ label: propertyName });
      await page.getByTestId("utility-plan-service-select").selectOption("electricity");
      await page.getByTestId("utility-plan-rate-type-select").selectOption("fixed");
      await page.getByTestId("utility-plan-provider-input").fill(providerName);
      await page.getByTestId("utility-plan-name-input").fill("12 Month Fixed");
      await page.getByTestId("utility-plan-energy-input").fill("11.6");
      await page.getByTestId("utility-plan-tdu-input").fill("5.3509");
      await page.getByTestId("utility-plan-avg-price-input").fill("13.9");
      await page.getByTestId("utility-plan-base-charge-input").fill("4.39");
      await page.getByTestId("utility-plan-term-months-input").fill("12");
      await page.getByTestId("utility-plan-start-date-input").fill(isoDateOffset(-400));
      // Term lapsed 35 days ago.
      await page.getByTestId("utility-plan-end-date-input").fill(isoDateOffset(-35));
      await page.getByTestId("utility-plan-etf-input").fill("150");
      await page.getByTestId("utility-plan-save-button").click();

      await expect(page.getByTestId("add-utility-plan-dialog")).toBeHidden({ timeout: 10000 });
      await page.waitForLoadState("networkidle");

      // 2) It shows in the list with the derived status the backend computed.
      const row = page.locator('[data-testid^="utility-plan-item-"]', {
        hasText: providerName,
      });
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row).toContainText(propertyName);
      await expect(row).toContainText("Lapsed 35 days ago");
      await expect(row.getByTestId("utility-plan-status-expired")).toBeVisible();

      const testId = await row.getAttribute("data-testid");
      planId = testId?.replace("utility-plan-item-", "") ?? null;
      expect(planId).toBeTruthy();
      if (!planId) throw new Error("Could not parse plan id from the row");

      // 3) Backend state agrees, including the sub-cent rate surviving the
      //    round trip — a TDU charge rounded to 5.35 would misprice the plan.
      const saved = await fetchPlan(api, planId);
      expect(saved.provider_name).toBe(providerName);
      expect(saved.renewal_status).toBe("expired");
      expect(saved.is_current).toBe(true);
      expect(saved.days_until_term_end).toBe(-35);
      expect(Number(saved.tdu_charge_cents_per_kwh)).toBeCloseTo(5.3509, 4);

      const alerts = await fetchAlerts(api);
      expect(alerts.expired.some((p) => p.id === planId)).toBe(true);

      // 4) The "needs renewing" filter keeps it.
      await page.getByTestId("utility-plans-expiring-toggle").check();
      await expect(row).toBeVisible();

      // 5) The dashboard card surfaces it without the operator going looking.
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const card = page.getByTestId("utility-plan-alert-card");
      await expect(card).toBeVisible({ timeout: 15000 });
      await expect(card).toContainText("Utility plans needing renewal");
      await expect(
        page.getByTestId(`utility-plan-alert-${planId}`),
      ).toContainText(propertyName);

      // 6) DELETE through the UI; the row goes and the API agrees. The trash
      //    icon only opens the confirmation — the plan survives until the
      //    operator confirms, so the row must still be there in between.
      await page.goto("/utility-plans");
      await waitForListPage(page);
      await page.getByTestId(`utility-plan-delete-${planId}`).click();
      await expect(page.getByText("Remove this utility plan?")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId(`utility-plan-item-${planId}`)).toBeVisible();
      await page.getByRole("button", { name: "Remove plan" }).click();
      await expect(page.getByTestId(`utility-plan-item-${planId}`)).toBeHidden({
        timeout: 10000,
      });

      const afterDelete = await api.get(`/utility-plans/${planId}`);
      expect(afterDelete.status()).toBe(404);
      planId = null;
    } finally {
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("a regulated plan is recorded without a renewal alert", async ({
    authedPage: page,
    api,
  }) => {
    // Houston natural gas is a monopoly — there is no competing supplier, so
    // flagging it for renewal would be pure noise. This is the case the
    // rate-type hint in the dialog exists to explain.
    const runId = Date.now();
    const propertyName = `E2E Gas Property ${runId}`;
    const providerName = `E2E Gas Co ${runId}`;
    let propertyId: string | null = null;
    let planId: string | null = null;

    try {
      const property = await createProperty(api, { name: propertyName });
      propertyId = property.id;

      await page.goto("/utility-plans");
      await waitForListPage(page);

      await page.getByTestId("add-utility-plan-button").click();
      await page.getByTestId("utility-plan-property-select").selectOption({ label: propertyName });
      await page.getByTestId("utility-plan-service-select").selectOption("natural_gas");
      await page.getByTestId("utility-plan-rate-type-select").selectOption("regulated");
      await expect(page.getByTestId("utility-plan-rate-hint")).toContainText(
        "no renewal alert",
      );
      await page.getByTestId("utility-plan-provider-input").fill(providerName);
      await page.getByTestId("utility-plan-account-input").fill("6403771807-5");
      await page.getByTestId("utility-plan-save-button").click();

      await expect(page.getByTestId("add-utility-plan-dialog")).toBeHidden({ timeout: 10000 });
      await page.waitForLoadState("networkidle");

      const row = page.locator('[data-testid^="utility-plan-item-"]', {
        hasText: providerName,
      });
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.getByTestId("utility-plan-status-not_applicable")).toBeVisible();

      const testId = await row.getAttribute("data-testid");
      planId = testId?.replace("utility-plan-item-", "") ?? null;
      if (!planId) throw new Error("Could not parse plan id from the row");

      // Absent from the alerts payload entirely.
      const alerts = await fetchAlerts(api);
      const flagged = [...alerts.expired, ...alerts.expiring_soon];
      expect(flagged.some((p) => p.id === planId)).toBe(false);

      // And the "needs renewing" filter excludes it.
      await page.getByTestId("utility-plans-expiring-toggle").check();
      await expect(page.getByTestId(`utility-plan-item-${planId}`)).toBeHidden();
    } finally {
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });

  test("editing a plan corrects it without erasing the terms the form cannot edit", async ({
    authedPage: page,
    api,
  }) => {
    // The seeded Peerless plans carry a minimum-usage clause and a provenance
    // note that this dialog has no fields for. Because PATCH applies exactly
    // the keys it is sent, a save that emitted them as null would silently
    // erase both — so the plan is created with them set and asserted intact
    // afterwards.
    const runId = Date.now();
    const propertyName = `E2E Edit Property ${runId}`;
    const providerName = `E2E Edit Power ${runId}`;
    const NOTE = "Account number unresolved — set it from a bill.";
    let propertyId: string | null = null;
    let planId: string | null = null;

    try {
      const property = await createProperty(api, { name: propertyName });
      propertyId = property.id;

      const created = await api.post("/utility-plans", {
        data: {
          property_id: propertyId,
          service_type: "electricity",
          rate_type: "fixed",
          provider_name: providerName,
          plan_name: "12 Month Fixed",
          energy_charge_cents_per_kwh: "11.6",
          tdu_charge_cents_per_kwh: "5.3509",
          term_months: 12,
          service_start_date: isoDateOffset(-400),
          term_end_date: isoDateOffset(-35),
          min_usage_fee_cents: 995,
          min_usage_threshold_kwh: 999,
          notes: NOTE,
        },
      });
      expect(created.ok()).toBe(true);
      planId = ((await created.json()) as UtilityPlanRow).id;

      await page.goto("/utility-plans");
      await waitForListPage(page);

      const row = page.getByTestId(`utility-plan-item-${planId}`);
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.getByTestId("utility-plan-status-expired")).toBeVisible();

      // 1) Open the editor and confirm it arrived prefilled, not blank.
      await page.getByTestId(`utility-plan-edit-${planId}`).click();
      await expect(page.getByTestId("edit-utility-plan-dialog")).toBeVisible();
      await expect(page.getByTestId("utility-plan-provider-input")).toHaveValue(
        providerName,
        { timeout: 10000 },
      );
      await expect(page.getByTestId("utility-plan-tdu-input")).toHaveValue("5.3509");
      await expect(page.getByTestId("edit-utility-plan-property")).toContainText(
        propertyName,
      );
      // The property is fixed for the life of the plan.
      await expect(page.getByTestId("utility-plan-property-select")).toBeHidden();

      // 2) Fill in the account number the row was missing and renew the term.
      const renewedEnd = isoDateOffset(300);
      await page.getByTestId("utility-plan-account-input").fill("6403771807-5");
      await page.getByTestId("utility-plan-end-date-input").fill(renewedEnd);
      await page.getByTestId("utility-plan-save-button").click();

      await expect(page.getByTestId("edit-utility-plan-dialog")).toBeHidden({
        timeout: 10000,
      });
      await page.waitForLoadState("networkidle");

      // 3) The list re-derives the status from the new term end.
      await expect(row.getByTestId("utility-plan-status-active")).toBeVisible({
        timeout: 10000,
      });
      await expect(row).not.toContainText("Lapsed");

      // 4) The backend agrees — the edits landed and everything the form does
      //    not own is byte-identical to what was created.
      const saved = await fetchPlan(api, planId);
      // Stored in lookup-key form: the service strips dashes so a number typed
      // as it appears on the bill still matches the learned bill→property link.
      expect(saved.account_number).toBe("64037718075");
      expect(saved.term_end_date).toBe(renewedEnd);
      expect(saved.renewal_status).toBe("active");
      expect(saved.plan_name).toBe("12 Month Fixed");
      expect(Number(saved.tdu_charge_cents_per_kwh)).toBeCloseTo(5.3509, 4);
      expect(saved.min_usage_fee_cents).toBe(995);
      expect(saved.min_usage_threshold_kwh).toBe(999);
      expect(saved.notes).toBe(NOTE);
    } finally {
      if (planId) await api.delete(`/utility-plans/${planId}`).catch(() => {});
      if (propertyId) await deleteProperty(api, propertyId);
    }
  });
});
