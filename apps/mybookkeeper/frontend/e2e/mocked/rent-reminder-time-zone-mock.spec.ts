/**
 * No-backend E2E: a new rent reminder is set up in the host's own time zone,
 * and the form says which zone the send time is read in (it used to claim
 * "Central time" for everyone).
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubNoSignedLeases } from "./fixtures/emptyLists";
import { APPLICANT_DETAIL, APPLICANT_ID, SCREENING_ELIGIBLE, SCREENING_PROVIDERS } from "./fixtures/mockApplicant";

const NO_PLAN_OVERVIEW = {
  plan: null,
  sms: { available: false, from_number: null },
  tenant_has_email: true,
  tenant_has_phone: false,
};

const EMPTY_LEDGER = {
  applicant_id: APPLICANT_ID,
  as_of: "2026-11-17",
  schedules: [],
  charges: [],
  payments: [],
  current_period: null,
  total_charged: "0.00",
  total_paid: "0.00",
  balance: "0.00",
  unapplied_credit: "0.00",
};

test.use({ timezoneId: "America/Los_Angeles" });

test("a Pacific host sets up reminders in Pacific time, not Central", async ({ page }) => {
  const created: Record<string, unknown>[] = [];
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await stubNoSignedLeases(page);
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) =>
    route.fulfill(json({ ...APPLICANT_DETAIL, stage: "lease_signed" })),
  );
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}/screening/eligibility$`), (route) =>
    route.fulfill(json(SCREENING_ELIGIBLE)),
  );
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}/screening/providers$`), (route) =>
    route.fulfill(json(SCREENING_PROVIDERS)),
  );
  await page.route(new RegExp(`/api/rent-ledger/tenants/${APPLICANT_ID}`), (route) =>
    route.fulfill(json(EMPTY_LEDGER)),
  );
  await page.route(new RegExp(`/api/rent-reminders/tenants/${APPLICANT_ID}$`), (route) =>
    route.fulfill(json(NO_PLAN_OVERVIEW)),
  );
  await page.route(new RegExp(`/api/rent-reminders/tenants/${APPLICANT_ID}/plan$`), async (route, request) => {
    created.push(request.postDataJSON());
    await route.fulfill(json({ ...request.postDataJSON(), id: "plan-1", applicant_id: APPLICANT_ID }));
  });

  await page.goto(`/applicants/${APPLICANT_ID}`);
  await page.getByTestId("rent-reminder-setup").click();

  await expect(page.getByText(/^At \(P[SD]T\)$/)).toBeVisible();
  await expect(page.getByText(/Central/)).toHaveCount(0);

  await page.getByTestId("rent-reminder-save").click();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0].timezone).toBe("America/Los_Angeles");
});
