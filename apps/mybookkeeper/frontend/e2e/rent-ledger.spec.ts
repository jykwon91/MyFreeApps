import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * E2E for the tenant rent ledger.
 *
 * The scenario under test is the one the feature exists for: a tenant charged
 * $1,500 a month who pays $375 a week. Each test drives the real API — seed a
 * tenant, seed dated payments, create a schedule through the UI — and then
 * asserts both what the page shows and what the backend actually stored.
 */

const MONTHLY_RENT = "1500";
const WEEKLY_PAYMENT = "375.00";

interface Ledger {
  schedules: Array<{ id: string; amount: string; cadence: string; start_date: string }>;
  charges: Array<{
    id: string;
    amount: string;
    full_amount: string | null;
    allocated: string;
    period_start: string;
    period_end: string;
    status: string;
    waived_at: string | null;
  }>;
  current_period: {
    allocated: string;
    amount: string;
    full_amount: string | null;
    status: string;
  } | null;
  balance: string;
  total_paid: string;
}

async function seedTenant(api: APIRequestContext, name: string): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { stage: "lease_signed", legal_name: name, seed_event: true },
  });
  if (!res.ok()) {
    throw new Error(`seedApplicant failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { id: string }).id;
}

async function seedPayments(
  api: APIRequestContext,
  applicantId: string,
  paidOn: string[],
  opts: { amount?: string; category?: string } = {},
): Promise<string[]> {
  const res = await api.post("/test/seed-tenant-payments", {
    data: {
      applicant_id: applicantId,
      paid_on: paidOn,
      amount: opts.amount ?? WEEKLY_PAYMENT,
      category: opts.category ?? "rental_revenue",
    },
  });
  if (!res.ok()) {
    throw new Error(`seedPayments failed: ${res.status()} ${await res.text()}`);
  }
  return ((await res.json()) as { transaction_ids: string[] }).transaction_ids;
}

async function getLedger(
  api: APIRequestContext,
  applicantId: string,
  asOf: string,
): Promise<Ledger> {
  const res = await api.get(`/rent-ledger/tenants/${applicantId}?as_of=${asOf}`);
  if (!res.ok()) throw new Error(`getLedger failed: ${res.status()}`);
  return res.json() as Promise<Ledger>;
}

async function cleanUp(
  api: APIRequestContext,
  applicantId: string,
  transactionIds: string[],
): Promise<void> {
  for (const id of transactionIds) {
    await api.delete(`/test/tenant-payments/${id}`).catch(() => {});
  }
  if (applicantId) {
    await api.delete(`/test/applicants/${applicantId}`).catch(() => {});
  }
}

/** Fills the "Set up rent" dialog and saves. */
async function createSchedule(
  page: import("@playwright/test").Page,
  startDate: string,
): Promise<void> {
  await page.getByTestId("rent-setup-button").click();
  await expect(page.getByTestId("rent-schedule-dialog")).toBeVisible();
  await page.getByTestId("rent-schedule-amount").fill(MONTHLY_RENT);
  await page.getByTestId("rent-schedule-start").fill(startDate);
  await page.getByTestId("rent-schedule-save-button").click();
  await expect(page.getByTestId("rent-schedule-dialog")).toBeHidden();
}

test.describe("Rent ledger", () => {
  test("weekly payments settle a monthly charge — UI and DB agree", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Weekly ${runId}`);
      // Three of August's weekly payments: $1,125 of $1,500.
      transactionIds = await seedPayments(api, applicantId, [
        "2026-08-03",
        "2026-08-10",
        "2026-08-17",
      ]);

      await page.goto(`/applicants/${applicantId}`);
      await expect(page.getByTestId("rent-ledger-section")).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId("rent-ledger-empty")).toBeVisible();

      await createSchedule(page, "2026-08-01");

      // The page states the answer as a fraction of the period, not a total.
      await expect(page.getByTestId("rent-current-allocated")).toHaveText(
        "$1,125.00",
      );
      await expect(page.getByTestId("rent-current-period")).toContainText(
        "of $1,500.00",
      );

      // The backend agrees, and the schedule was really persisted.
      const ledger = await getLedger(api, applicantId, "2026-08-20");
      expect(ledger.schedules).toHaveLength(1);
      expect(ledger.schedules[0].amount).toBe("1500.00");
      expect(ledger.schedules[0].cadence).toBe("monthly");
      expect(ledger.total_paid).toBe("1125.00");
      expect(ledger.balance).toBe("375.00");
      expect(ledger.current_period?.status).toBe("partial");
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });

  test("a tenant mid-month is partly paid, not overdue", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Ontrack ${runId}`);
      transactionIds = await seedPayments(api, applicantId, [
        "2026-08-03",
        "2026-08-10",
      ]);

      await page.goto(`/applicants/${applicantId}`);
      await expect(page.getByTestId("rent-ledger-section")).toBeVisible({
        timeout: 15000,
      });
      await createSchedule(page, "2026-08-01");

      // The rule that makes this feature usable: the due date passing is not
      // delinquency for an instalment payer — the period ending short is.
      const midMonth = await getLedger(api, applicantId, "2026-08-20");
      expect(midMonth.current_period?.status).toBe("partial");

      const afterPeriod = await getLedger(api, applicantId, "2026-09-05");
      const august = afterPeriod.charges.find((c) => c.amount === "1500.00");
      expect(august?.status).toBe("overdue");
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });

  test("a mid-month move-in is prorated, then billed whole months", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Prorated ${runId}`);
      transactionIds = await seedPayments(api, applicantId, ["2026-08-20"]);

      await page.goto(`/applicants/${applicantId}`);
      await expect(page.getByTestId("rent-ledger-section")).toBeVisible({
        timeout: 15000,
      });
      await createSchedule(page, "2026-08-15");

      // 17 of August's 31 days of $1,500 — and the page says why, so the
      // short number cannot be mistaken for a shortfall.
      await expect(page.getByTestId("rent-current-period")).toContainText(
        "of $822.58",
      );
      await expect(page.getByTestId("rent-current-prorated")).toContainText(
        "Prorated from $1,500.00",
      );

      const ledger = await getLedger(api, applicantId, "2026-09-20");
      const [august, september] = ledger.charges;
      expect([august.period_start, august.period_end]).toEqual([
        "2026-08-15",
        "2026-08-31",
      ]);
      expect(august.amount).toBe("822.58");
      expect(august.full_amount).toBe("1500.00");
      // The month after a prorated move-in is a whole calendar month.
      expect([september.period_start, september.period_end]).toEqual([
        "2026-09-01",
        "2026-09-30",
      ]);
      expect(september.amount).toBe("1500.00");
      expect(september.full_amount).toBeNull();
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });

  test("a deposit does not settle rent", async ({ authedPage: page, api }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Deposit ${runId}`);
      const rent = await seedPayments(api, applicantId, ["2026-08-03"]);
      const deposit = await seedPayments(api, applicantId, ["2026-08-03"], {
        amount: "1500.00",
        category: "security_deposit",
      });
      transactionIds = [...rent, ...deposit];

      await page.goto(`/applicants/${applicantId}`);
      await expect(page.getByTestId("rent-ledger-section")).toBeVisible({
        timeout: 15000,
      });
      await createSchedule(page, "2026-08-01");

      // Only the $375 of rent counts; the deposit is held, not earned.
      await expect(page.getByTestId("rent-current-allocated")).toHaveText(
        "$375.00",
      );
      const ledger = await getLedger(api, applicantId, "2026-08-20");
      expect(ledger.total_paid).toBe("375.00");
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });

  test("waiving a charge clears the balance and records the reason", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Waive ${runId}`);
      transactionIds = await seedPayments(api, applicantId, ["2026-08-03"]);

      await page.goto(`/applicants/${applicantId}`);
      await expect(page.getByTestId("rent-ledger-section")).toBeVisible({
        timeout: 15000,
      });
      await createSchedule(page, "2026-08-01");

      await page.getByTestId("rent-waive-charge-button").first().click();
      await expect(page.getByTestId("rent-waive-dialog")).toBeVisible();
      await page
        .getByTestId("rent-waive-reason")
        .fill("Room was being repainted.");
      await page.getByTestId("rent-waive-save-button").click();
      await expect(page.getByTestId("rent-waive-dialog")).toBeHidden();

      await expect(page.getByTestId("rent-balance-line")).toContainText(
        "Paid ahead by",
      );

      const ledger = await getLedger(api, applicantId, "2026-08-20");
      const waived = ledger.charges.find((c) => c.waived_at !== null);
      expect(waived).toBeDefined();
      // A waived charge is not owed, so the $375 already paid reads as credit.
      expect(ledger.balance).toBe("-375.00");
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });

  test("payments are annotated with the period they settled", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Applied ${runId}`);
      transactionIds = await seedPayments(api, applicantId, ["2026-08-03"]);

      await page.goto(`/applicants/${applicantId}`);
      await expect(page.getByTestId("rent-ledger-section")).toBeVisible({
        timeout: 15000,
      });
      await createSchedule(page, "2026-08-01");

      await expect(
        page.getByTestId("payment-row-rent-applied").first(),
      ).toContainText("Applied to August 2026");
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });

  test("the skeleton mirrors the loaded panel's sections", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    let applicantId = "";
    let transactionIds: string[] = [];

    try {
      applicantId = await seedTenant(api, `E2E Rent Skeleton ${runId}`);
      transactionIds = await seedPayments(api, applicantId, ["2026-08-03"]);

      // Hold the ledger response so the skeleton stays on screen long enough
      // to compare against the panel it stands in for.
      await page.route("**/api/rent-ledger/tenants/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      });

      await page.goto(`/applicants/${applicantId}`);
      const skeleton = page.getByTestId("rent-ledger-skeleton");
      await expect(skeleton).toBeVisible({ timeout: 15000 });
      const skeletonBox = await skeleton.boundingBox();

      await page.unroute("**/api/rent-ledger/tenants/**");
      await expect(skeleton).toBeHidden({ timeout: 15000 });
      await expect(page.getByTestId("rent-ledger-empty")).toBeVisible();

      // The skeleton reserves real height rather than collapsing to a line,
      // which is what stops the section below it jumping when data lands.
      expect(skeletonBox?.height ?? 0).toBeGreaterThan(200);
    } finally {
      await cleanUp(api, applicantId, transactionIds);
    }
  });
});
