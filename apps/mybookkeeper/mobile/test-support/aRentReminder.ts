import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";

export function aReminderPlan(overrides: Partial<RentReminderPlan> = {}): RentReminderPlan {
  return {
    id: "plan1",
    applicant_id: "a1",
    frequency: "weekly",
    due_weekday: 6,
    send_days_before: 1,
    send_time: "18:00:00",
    timezone: "America/Chicago",
    email_enabled: true,
    sms_enabled: true,
    amount_override: null,
    payment_instructions: null,
    is_active: true,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
    ...overrides,
  };
}

export function aReminderOverview(overrides: Partial<RentReminderOverview> = {}): RentReminderOverview {
  return {
    plan: aReminderPlan(),
    sms: { available: true, from_number: "+15550000000", encrypted: true, webhook_url: "https://example.test/hook" },
    tenant_has_email: true,
    tenant_has_phone: true,
    ...overrides,
  };
}

export function aReminderPreview(overrides: Partial<RentReminderPreview> = {}): RentReminderPreview {
  return {
    due_date: "2030-11-03",
    send_at: "2030-11-02T18:00:00-05:00",
    amount: "300.00",
    period_start: "2030-11-03",
    period_end: "2030-11-09",
    message: "Hi Dana, rent of $300 is due tomorrow (Sunday).",
    send_now_message: "Hi Dana, rent of $300 is due on Sunday, Nov 3.",
    sent_channels: [],
    ...overrides,
  };
}

export function aReminderSend(overrides: Partial<RentReminderSend> = {}): RentReminderSend {
  return {
    id: "send1",
    due_date: "2030-11-03",
    channel: "email",
    status: "sent",
    amount: "300.00",
    error_code: null,
    created_at: "2030-11-01T12:00:00Z",
    sent_at: "2030-11-01T12:00:00Z",
    confirmed_at: null,
    ...overrides,
  };
}
