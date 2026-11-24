/**
 * No-backend E2E: a rent reminder nobody confirmed is shown as "may already
 * have been sent", with where to check for its channel (a text's httpSMS log,
 * or for an email the tenant), so the host doesn't resend it blind. One that
 * definitely failed says plainly it wasn't sent. Send now stays off for a
 * reminder that may have gone out until the host confirms they checked, and
 * then says so to the server.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubNoSignedLeases } from "./fixtures/emptyLists";
import type { RentReminderChannel } from "@mybookkeeper/api-client/types/rent/rent-reminder-channel";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSendStatus } from "@mybookkeeper/api-client/types/rent/rent-reminder-send-status";
import { APPLICANT_DETAIL, APPLICANT_ID, SCREENING_ELIGIBLE, SCREENING_PROVIDERS } from "./fixtures/mockApplicant";

const OVERVIEW = {
  sms: { available: true, from_number: "+17135550199", encrypted: true, webhook_url: "https://example.test/api/rent-reminders/sms/webhook" },
  tenant_has_email: true,
  tenant_has_phone: true,
  plan: {
    id: "plan-1",
    applicant_id: APPLICANT_ID,
    frequency: "weekly",
    due_weekday: 6,
    send_days_before: 1,
    send_time: "18:00:00",
    timezone: "America/Chicago",
    email_enabled: true,
    sms_enabled: true,
    amount_override: null,
    payment_instructions: "Zelle to host@example.com",
    is_active: true,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
  },
};

const PREVIEW: RentReminderPreview = {
  due_date: "2026-11-29",
  send_at: "2026-11-28T18:00:00-06:00",
  amount: "300.00",
  period_start: "2026-11-29",
  period_end: "2026-12-05",
  message: "Hi Sonu, reminder: rent of $300 is due tomorrow (Sunday). Pay via Zelle to host@example.com.",
  send_now_message: "Hi Sonu, reminder: rent of $300 is due on Sunday, Nov 29. Pay via Zelle to host@example.com.",
  sent_channels: [],
  possibly_sent: [],
};

const failedReminder = (id: string, dueDate: string, errorCode: string, channel: RentReminderChannel = "sms") => ({
  id,
  due_date: dueDate,
  channel,
  status: "failed",
  amount: "300.00",
  error_code: errorCode,
  created_at: "2026-11-21T00:00:00Z",
  sent_at: null,
  confirmed_at: null,
});

const failedText = (id: string, dueDate: string, errorCode: string) => failedReminder(id, dueDate, errorCode);

const PLAN_CHANNEL_ON: Record<RentReminderChannel, boolean> = {
  email: OVERVIEW.plan.email_enabled,
  sms: OVERVIEW.plan.sms_enabled,
};
// Send now tries every channel OVERVIEW's plan has on, email first, as the server does.
const PLAN_CHANNELS: readonly RentReminderChannel[] = (["email", "sms"] as const).filter(
  (channel) => PLAN_CHANNEL_ON[channel],
);
// How Send now's new try comes back: a text waits for the phone's report, an
// email is sent once the mail server takes it.
const SENT_STATUS = { sms: "sent_to_phone", email: "sent" } as const satisfies Record<
  RentReminderChannel,
  RentReminderSendStatus
>;

const TEXT_SENDS = [
  failedText("send-unknown", "2026-11-22", "sms_outcome_unknown"),
  failedText("send-unreachable", "2026-11-15", "sms_network_error"),
];
const EMAIL_SENDS = [
  failedReminder("send-email-unknown", "2026-11-22", "email_outcome_unknown", "email"),
  failedReminder("send-email-refused", "2026-11-15", "email_send_failed", "email"),
];

const EMPTY_LEDGER = {
  applicant_id: APPLICANT_ID,
  as_of: "2026-11-21",
  schedules: [],
  charges: [],
  payments: [],
  current_period: null,
  total_charged: "0.00",
  total_paid: "0.00",
  balance: "0.00",
  unapplied_credit: "0.00",
};

async function showTenant(
  page: Page,
  preview: RentReminderPreview,
  sends: readonly ReturnType<typeof failedReminder>[] = TEXT_SENDS,
): Promise<unknown[]> {
  const sendBodies: unknown[] = [];
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
    route.fulfill(json(OVERVIEW)),
  );
  await page.route(new RegExp(`/api/rent-reminders/tenants/${APPLICANT_ID}/preview`), (route) =>
    route.fulfill(json(preview)),
  );
  await page.route(new RegExp(`/api/rent-reminders/tenants/${APPLICANT_ID}/sends`), (route) =>
    route.fulfill(json(sends)),
  );
  await page.route(new RegExp(`/api/rent-reminders/tenants/${APPLICANT_ID}/send-now$`), (route) => {
    sendBodies.push(route.request().postDataJSON());
    const retries = PLAN_CHANNELS.map((channel) => ({
      ...failedReminder(`send-retry-${channel}`, PREVIEW.due_date, "", channel),
      status: SENT_STATUS[channel],
      error_code: null,
    }));
    return route.fulfill(json(retries));
  });

  await page.goto(`/applicants/${APPLICANT_ID}`);
  return sendBodies;
}

test("a text the relay never confirmed says it may already have been sent", async ({ page }) => {
  await showTenant(page, PREVIEW);

  const rows = page.getByTestId("rent-reminder-history-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("may already have been sent");
  await expect(rows.nth(0)).toContainText("httpsms.com");
  await expect(rows.nth(1)).toContainText("couldn't reach the text relay, so it wasn't sent");
  await expect(page.getByText("The text relay refused it")).toHaveCount(0);
});

test("Send now waits for the host to confirm they checked a text that may have gone out", async ({ page }) => {
  const sendBodies = await showTenant(page, { ...PREVIEW, possibly_sent: [{ channel: "sms", attempt: 2 }] });

  await expect(page.getByTestId("rent-reminder-possibly-sent")).toContainText(
    "The last text may already have reached the tenant",
  );
  const send = page.getByTestId("rent-reminder-send-now");
  await expect(send).toBeDisabled();
  await expect(send).toHaveAccessibleDescription(/may already have reached the tenant/);
  await page.getByTestId("rent-reminder-confirm-possibly-sent").check();
  await expect(send).toBeEnabled();
  await send.click();

  await expect.poll(() => sendBodies).toEqual([expect.objectContaining({ confirmed_possibly_sent: [{ channel: "sms", attempt: 2 }] })]);
  await expect(toast(page, "Reminder sent by email and text.")).toBeVisible();
});

test("an email the mail server never confirmed says to ask the tenant, not to check httpSMS", async ({ page }) => {
  await showTenant(page, PREVIEW, EMAIL_SENDS);

  const rows = page.getByTestId("rent-reminder-history-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("may already have been sent");
  await expect(rows.nth(0)).toContainText("Ask the tenant");
  await expect(rows.nth(0)).not.toContainText("httpsms.com");
  await expect(rows.nth(1)).toContainText("The mail server didn't take it");
});

test("Send now waits for the host to confirm they asked the tenant about an email that may have gone out", async ({ page }) => {
  const sendBodies = await showTenant(
    page,
    { ...PREVIEW, possibly_sent: [{ channel: "email", attempt: 2 }] },
    EMAIL_SENDS,
  );

  const warning = page.getByTestId("rent-reminder-possibly-sent");
  await expect(warning).toContainText("The last email may already have reached the tenant");
  await expect(warning).toContainText("Ask the tenant whether the email arrived");
  await expect(warning).not.toContainText("httpsms.com");
  const send = page.getByTestId("rent-reminder-send-now");
  await expect(send).toBeDisabled();
  await page.getByTestId("rent-reminder-confirm-possibly-sent").check();
  await expect(send).toBeEnabled();
  await send.click();

  await expect.poll(() => sendBodies).toEqual([expect.objectContaining({ confirmed_possibly_sent: [{ channel: "email", attempt: 2 }] })]);
  await expect(toast(page, "Reminder sent by email and text.")).toBeVisible();
});
