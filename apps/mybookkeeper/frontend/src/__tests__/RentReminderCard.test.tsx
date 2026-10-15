import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import RentReminderCard from "@/app/features/rent/RentReminderCard";
import type { RentReminderOverview } from "@/shared/types/rent/rent-reminder-overview";
import type { RentReminderPreview } from "@/shared/types/rent/rent-reminder-preview";
import type { RentReminderSend } from "@/shared/types/rent/rent-reminder-send";

const mockOverview = vi.fn();
const mockPreview = vi.fn();
const mockSends = vi.fn();
const mockCreate = vi.fn();
const mockSendNow = vi.fn();
const sendNowState = { isLoading: false };

vi.mock("@/shared/store/rentRemindersApi", () => ({
  useGetRentReminderOverviewQuery: (...args: unknown[]) => mockOverview(...args),
  useGetRentReminderPreviewQuery: (...args: unknown[]) => mockPreview(...args),
  useGetRentReminderSendsQuery: (...args: unknown[]) => mockSends(...args),
  useCreateRentReminderPlanMutation: () => [mockCreate, { isLoading: false }],
  useUpdateRentReminderPlanMutation: () => [vi.fn(), { isLoading: false }],
  useSendRentReminderNowMutation: () => [mockSendNow, sendNowState],
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
const SONU_PLAN: RentReminderOverview = {
  ...NO_PLAN,
  sms: { ...SMS_OFF, available: true, from_number: "+17135550199", encrypted: true },
  plan: {
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
  },
};

const PREVIEW: RentReminderPreview = {
  due_date: "2026-11-01",
  send_at: "2026-10-31T18:00:00-05:00",
  amount: "300.00",
  period_start: "2026-11-01",
  period_end: "2026-11-30",
  message:
    "Hi Sonu, reminder: rent of $300 is due tomorrow (Sunday). Pay via Zelle to jason@example.com.",
  sent_channels: ["email"],
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
      "Weekly, due every Sunday · reminded the day before at 6:00 PM",
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
    const button = screen.getByTestId("rent-reminder-send-now");
    expect(button).toHaveTextContent("Send email and text now");
    fireEvent.click(button);
    expect(mockSendNow).toHaveBeenCalledWith({ applicantId: "app-1" });
  });

  it("shows a retry on error", () => {
    const refetch = vi.fn();
    mockOverview.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderCard();
    fireEvent.click(screen.getByTestId("rent-reminder-retry"));
    expect(refetch).toHaveBeenCalled();
  });
});
