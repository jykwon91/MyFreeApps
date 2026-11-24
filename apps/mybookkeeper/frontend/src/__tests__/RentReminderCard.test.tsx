import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import RentReminderCard from "@/app/features/rent/RentReminderCard";
import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import type { RentReminderPlan } from "@mybookkeeper/api-client/types/rent/rent-reminder-plan";
import type { RentReminderPreview } from "@mybookkeeper/api-client/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@mybookkeeper/api-client/types/rent/rent-reminder-send";

const mockOverview = vi.fn();
const mockPreview = vi.fn();
const mockSends = vi.fn();
const mockCreate = vi.fn();
const mockSendNow = vi.fn();
const sendNowState = { isLoading: false };

vi.mock("@mybookkeeper/api-client/store/rentRemindersApi", () => ({
  useGetRentReminderOverviewQuery: (...args: unknown[]) => mockOverview(...args),
  useGetRentReminderPreviewQuery: (...args: unknown[]) => mockPreview(...args),
  useGetRentReminderSendsQuery: (...args: unknown[]) => mockSends(...args),
  useCreateRentReminderPlanMutation: () => [mockCreate, { isLoading: false }],
  useUpdateRentReminderPlanMutation: () => [vi.fn(), { isLoading: false }],
  useSendRentReminderNowMutation: () => [mockSendNow, sendNowState],
}));

const mockShowError = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: (message: string) => mockShowError(message),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useCanWrite: () => true,
}));

const SMS_OFF = {
  available: false,
  from_number: null,
  encrypted: false,
  webhook_url: "https://example.test/api/rent-reminders/sms/webhook",
};

const NO_PLAN: RentReminderOverview = {
  plan: null,
  sms: SMS_OFF,
  tenant_has_email: true,
  tenant_has_phone: true,
};

/** Sonu: $1,500/month, pays every Sunday, reminded Saturday at 6pm. */
const SONU_REMINDER_PLAN: RentReminderPlan = {
  id: "plan-1",
  applicant_id: "app-1",
  frequency: "weekly",
  due_weekday: 6,
  send_days_before: 1,
  send_time: "18:00:00",
  timezone: "America/Chicago",
  email_enabled: true,
  sms_enabled: true,
  amount_override: null,
  payment_instructions: "Zelle to jason@example.com",
  is_active: true,
  created_at: "2026-10-15T00:00:00Z",
  updated_at: "2026-10-15T00:00:00Z",
};

const SONU_PLAN: RentReminderOverview = {
  ...NO_PLAN,
  sms: { ...SMS_OFF, available: true, from_number: "+17135550199", encrypted: true },
  plan: SONU_REMINDER_PLAN,
};

const PREVIEW: RentReminderPreview = {
  due_date: "2026-11-01",
  send_at: "2026-10-31T18:00:00-05:00",
  amount: "300.00",
  period_start: "2026-11-01",
  period_end: "2026-11-30",
  message:
    "Hi Sonu, reminder: rent of $300 is due tomorrow (Sunday). Pay via Zelle to jason@example.com.",
  send_now_message:
    "Hi Sonu, reminder: rent of $300 is due on Sunday, Nov 1. Pay via Zelle to jason@example.com.",
  sent_channels: ["email"],
  possibly_sent: [],
};

const FAILED_TEXT: RentReminderSend = {
  id: "send-1",
  due_date: "2026-10-25",
  channel: "sms",
  status: "failed",
  amount: "375.00",
  error_code: "no_phone_confirmation",
  created_at: "2026-10-24T23:00:00Z",
  sent_at: "2026-10-24T23:00:05Z",
  confirmed_at: null,
};

function renderCard() {
  return render(
    <Provider store={store}>
      <RentReminderCard applicantId="app-1" />
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPreview.mockReturnValue({ data: PREVIEW, isLoading: false, isError: false });
  mockSends.mockReturnValue({ data: [FAILED_TEXT], isLoading: false, isError: false });
});

describe("RentReminderCard", () => {
  it("shows a skeleton while loading", () => {
    mockOverview.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderCard();
    expect(screen.getByTestId("rent-reminder-skeleton")).toBeInTheDocument();
  });

  it("offers setup when there is no plan", () => {
    mockOverview.mockReturnValue({ data: NO_PLAN, isLoading: false, isError: false });
    renderCard();
    expect(screen.getByTestId("rent-reminder-empty")).toBeInTheDocument();
    expect(screen.getByTestId("rent-reminder-setup")).toBeInTheDocument();
  });

  it("defaults days-before by frequency and disables texts when SMS is not set up", () => {
    mockOverview.mockReturnValue({ data: NO_PLAN, isLoading: false, isError: false });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-setup"));

    const days = screen.getByTestId("rent-reminder-days") as HTMLInputElement;
    expect(days.value).toBe("1");
    fireEvent.click(
      screen.getByTestId("rent-reminder-frequency-monthly").querySelector("input")!,
    );
    expect(days.value).toBe("3");
    expect(screen.getByText("Monthly — due on the 1st")).toBeInTheDocument();

    expect(screen.getByTestId("rent-reminder-sms")).toBeDisabled();
    expect(screen.getByTestId("rent-reminder-sms-status")).toHaveTextContent(
      "Not set up on this server",
    );
  });

  it("labels a new plan's send time in the device's zone and saves that zone", () => {
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
    spy.mockReturnValue({ timeZone: "America/Los_Angeles" } as Intl.ResolvedDateTimeFormatOptions);
    mockOverview.mockReturnValue({ data: NO_PLAN, isLoading: false, isError: false });
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-setup"));

    expect(screen.getByText(/^At \(P[SD]T\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/Central/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rent-reminder-save"));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ timezone: "America/Los_Angeles" }));
    spy.mockRestore();
  });

  it("keeps a saved plan's zone in the edit label", () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-edit"));
    expect(screen.getByText(/^At \(C[SD]T\)$/)).toBeInTheDocument();
  });

  it("submits the monthly plan", () => {
    mockOverview.mockReturnValue({ data: NO_PLAN, isLoading: false, isError: false });
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-setup"));
    fireEvent.click(
      screen.getByTestId("rent-reminder-frequency-monthly").querySelector("input")!,
    );
    fireEvent.click(screen.getByTestId("rent-reminder-save"));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantId: "app-1",
        frequency: "monthly",
        due_weekday: null,
        send_days_before: 3,
        send_time: "18:00",
        email_enabled: true,
        sms_enabled: false,
      }),
    );
  });

  it("shows the plan, the next message, and history with delivery status", () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    renderCard();

    expect(screen.getByTestId("rent-reminder-summary")).toHaveTextContent(
      /^Weekly, due every Sunday · reminded the day before at 6:00 PM C[SD]T$/,
    );
    expect(screen.getByTestId("rent-reminder-message")).toHaveTextContent(
      "Hi Sonu, reminder: rent of $300 is due tomorrow (Sunday).",
    );
    expect(screen.getByTestId("rent-reminder-send-at")).toHaveTextContent("Sat, Oct 31");

    // Email already went out for this due date, so the text waits for the
    // next one — the two never go out at different times.
    expect(screen.getByTestId("rent-reminder-send-now")).toBeDisabled();
    expect(screen.getByTestId("rent-reminder-send-now")).toHaveTextContent(
      "Sent for this due date",
    );

    const row = screen.getByTestId("rent-reminder-history-row");
    expect(row).toHaveTextContent("Failed");
    expect(row).toHaveTextContent("battery-optimized");
  });

  it("sends email and text together with one button", () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    mockPreview.mockReturnValue({
      data: { ...PREVIEW, sent_channels: [] },
      isLoading: false,
      isError: false,
    });
    mockSendNow.mockReturnValue({
      unwrap: () =>
        Promise.resolve([
          { ...FAILED_TEXT, channel: "email", status: "sent" },
          { ...FAILED_TEXT, status: "sent_to_phone" },
        ]),
    });
    renderCard();
    expect(screen.getByTestId("rent-reminder-send-now-message")).toHaveTextContent(
      PREVIEW.send_now_message,
    );
    const button = screen.getByTestId("rent-reminder-send-now");
    expect(button).toHaveTextContent("Send email and text now");
    fireEvent.click(button);
    expect(mockSendNow).toHaveBeenCalledWith({
      applicantId: "app-1",
      due_date: "2026-11-01",
      amount: "300.00",
      message: PREVIEW.send_now_message,
      channels: ["email", "sms"],
      confirmed_possibly_sent: [],
    });
  });

  it("sends only the email when the plan's texts are off", () => {
    mockOverview.mockReturnValue({
      data: { ...SONU_PLAN, plan: { ...SONU_REMINDER_PLAN, sms_enabled: false } },
      isLoading: false,
      isError: false,
    });
    mockPreview.mockReturnValue({ data: { ...PREVIEW, sent_channels: [] }, isLoading: false, isError: false });
    mockSendNow.mockReturnValue({
      unwrap: () => Promise.resolve([{ ...FAILED_TEXT, channel: "email", status: "sent" }]),
    });
    renderCard();
    const button = screen.getByTestId("rent-reminder-send-now");
    expect(button).toHaveTextContent("Send email now");
    fireEvent.click(button);
    expect(mockSendNow).toHaveBeenCalledWith(expect.objectContaining({ channels: ["email"] }));
  });

  it("says a text the relay never confirmed may already have been sent", async () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    mockPreview.mockReturnValue({ data: { ...PREVIEW, sent_channels: [] }, isLoading: false, isError: false });
    mockSendNow.mockReturnValue({
      unwrap: () =>
        Promise.resolve([
          { ...FAILED_TEXT, channel: "email", status: "failed", error_code: "email_send_failed" },
          { ...FAILED_TEXT, error_code: "sms_outcome_unknown" },
        ]),
    });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-send-now"));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(1));
    const message = mockShowError.mock.calls[0][0] as string;
    expect(message).toContain("The email didn't go out.");
    expect(message).toContain("The text may already have been sent");
    expect(message).toContain("httpsms.com");
    expect(message).not.toContain("text didn't go out");
  });

  it("never sends the operator to httpsms.com about an email that may have gone out", async () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    mockPreview.mockReturnValue({
      data: { ...PREVIEW, sent_channels: [], possibly_sent: [{ channel: "email", attempt: 1 }] },
      isLoading: false,
      isError: false,
    });
    mockSendNow.mockReturnValue({
      unwrap: () =>
        Promise.resolve([
          { ...FAILED_TEXT, channel: "email", error_code: "send_interrupted" },
          { ...FAILED_TEXT, status: "sent_to_phone", error_code: null },
        ]),
    });
    renderCard();
    const warning = screen.getByTestId("rent-reminder-possibly-sent");
    expect(warning).toHaveTextContent("The last email may already have reached the tenant");
    expect(warning).toHaveTextContent("Ask the tenant whether the email arrived");
    expect(warning).not.toHaveTextContent("httpsms.com");
    fireEvent.click(screen.getByTestId("rent-reminder-confirm-possibly-sent"));
    fireEvent.click(screen.getByTestId("rent-reminder-send-now"));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(1));
    const message = mockShowError.mock.calls[0][0] as string;
    expect(message).toContain("The email may already have been sent. Ask the tenant whether the email arrived");
    expect(message).not.toContain("httpsms.com");
  });

  it("tells the operator an email the mail server never confirmed may already have been sent", async () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    mockPreview.mockReturnValue({ data: { ...PREVIEW, sent_channels: [] }, isLoading: false, isError: false });
    mockSendNow.mockReturnValue({
      unwrap: () =>
        Promise.resolve([
          { ...FAILED_TEXT, channel: "email", status: "failed", error_code: "email_outcome_unknown" },
          { ...FAILED_TEXT, status: "sent_to_phone", error_code: null },
        ]),
    });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-send-now"));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledTimes(1));
    const message = mockShowError.mock.calls[0][0] as string;
    expect(message).toContain("The email may already have been sent");
    expect(message).toContain("Ask the tenant whether the email arrived");
    expect(message).not.toContain("email didn't go out");
    expect(message).not.toContain("httpsms.com");
  });

  it("won't resend a text that may have gone out until the operator confirms they checked", () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    mockPreview.mockReturnValue({
      data: { ...PREVIEW, sent_channels: [], possibly_sent: [{ channel: "sms", attempt: 2 }] },
      isLoading: false,
      isError: false,
    });
    mockSendNow.mockReturnValue({ unwrap: () => Promise.resolve([{ ...FAILED_TEXT, status: "sent_to_phone" }]) });
    renderCard();
    const warning = screen.getByTestId("rent-reminder-possibly-sent");
    expect(warning).toHaveTextContent("The last text may already have reached the tenant");
    expect(warning).toHaveTextContent("httpsms.com");
    const button = screen.getByTestId("rent-reminder-send-now");
    expect(button).toBeDisabled();
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent("may already have reached the tenant");
    fireEvent.click(screen.getByTestId("rent-reminder-confirm-possibly-sent"));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockSendNow).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed_possibly_sent: [{ channel: "sms", attempt: 2 }] }),
    );
  });

  it("asks again when a newer try or another due date may have gone out", () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    const shown: RentReminderPreview = { ...PREVIEW, sent_channels: [], possibly_sent: [{ channel: "sms", attempt: 1 }] };
    mockPreview.mockReturnValue({ data: shown, isLoading: false, isError: false });
    const { rerender } = renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-confirm-possibly-sent"));
    expect(screen.getByTestId("rent-reminder-send-now")).toBeEnabled();

    for (const next of [
      { ...shown, possibly_sent: [{ channel: "sms" as const, attempt: 2 }] },
      { ...shown, due_date: "2026-11-08", possibly_sent: [{ channel: "sms" as const, attempt: 2 }] },
    ]) {
      mockPreview.mockReturnValue({ data: next, isLoading: false, isError: false });
      rerender(
        <Provider store={store}>
          <RentReminderCard applicantId="app-1" />
        </Provider>,
      );
      expect(screen.getByTestId("rent-reminder-confirm-possibly-sent")).not.toBeChecked();
      expect(screen.getByTestId("rent-reminder-send-now")).toBeDisabled();
      fireEvent.click(screen.getByTestId("rent-reminder-confirm-possibly-sent"));
    }
  });

  it("explains a refusal to resend a reminder that may have gone out", async () => {
    mockOverview.mockReturnValue({ data: SONU_PLAN, isLoading: false, isError: false });
    mockPreview.mockReturnValue({ data: { ...PREVIEW, sent_channels: [] }, isLoading: false, isError: false });
    mockSendNow.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 409, data: { detail: { code: "REMINDER_MAY_HAVE_BEEN_SENT", message: "check" } } }),
    });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-send-now"));
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith("check"),
    );
  });

  it("shows a retry on error", () => {
    const refetch = vi.fn();
    mockOverview.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });
});
