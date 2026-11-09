import type { RentReminderOverview } from "@mybookkeeper/api-client/types/rent/rent-reminder-overview";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { REMINDER_SETUP_MESSAGES as S } from "../src/constants/rentReminderSetup";
import { RENT_MANAGE_MESSAGES } from "../src/constants/rentManage";
import TenantRentReminders from "../src/features/rent/TenantRentReminders";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aRentLedger, aRentSchedule } from "../test-support/aRentLedger";
import { aReminderOverview, aReminderPlan } from "../test-support/aRentReminder";
import { startRentWritesServer, type RentWritesServer } from "../test-support/rentWritesServer";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;
const PLAN_URL = "/rent-reminders/tenants/a1/plan";

async function start(overview: RentReminderOverview, role = "owner"): Promise<RentWritesServer> {
  const server = startRentWritesServer(aRentLedger({ schedules: [aRentSchedule()] }), role);
  server.overview = overview;
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TenantRentReminders applicantId="a1" hasEnded={false} name="Dana Reed" />
      </ToastProvider>
    </Provider>,
  );
  await act(async () => {
    while (server.workspaceReads === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return server;
}

function field(label: string) {
  return screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(, required)?$`));
}

async function openSheet(title: string, buttonText: string) {
  await fireEvent.press(await screen.findByText(buttonText));
  await screen.findByRole("header", { name: title });
}

async function save(name: string) {
  const buttons = screen.getAllByRole("button", { name });
  await fireEvent.press(buttons[buttons.length - 1]);
}

beforeEach(async () => {
  await session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("setting reminders up", () => {
  const NO_PLAN = aReminderOverview({ plan: null });

  it("starts from weekly on Sunday, one day before, 6:00 PM, by email", async () => {
    await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);

    expect(screen.getByRole("radio", { name: "Sunday" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(field(S.daysBefore).props.value).toBe("1");
    expect(screen.getByText("6:00 PM")).toBeTruthy();
    expect(screen.getByRole("switch", { name: new RegExp(`^${S.email}`) }).props.value).toBe(true);
    expect(screen.getByRole("switch", { name: new RegExp(`^${S.sms}`) }).props.value).toBe(false);
    expect(screen.queryByText(S.remindersOn)).toBeNull();
  });

  it("creates the whole plan with a POST and says reminders are on", async () => {
    const server = await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    await fireEvent.press(screen.getByRole("radio", { name: "Friday" }));
    await fireEvent.changeText(field(S.daysBefore), "2");
    await fireEvent.changeText(field(S.howToPay), "  Zelle to me@example.com ");
    await fireEvent.changeText(field(S.fixedAmount), "300");

    await save(S.saveNew);

    expect(await screen.findByText(S.savedNew)).toBeTruthy();
    expect(server.writes).toEqual([
      {
        method: "POST",
        url: PLAN_URL,
        body: {
          frequency: "weekly",
          due_weekday: 4,
          send_days_before: 2,
          send_time: "18:00",
          timezone: "America/Chicago",
          email_enabled: true,
          sms_enabled: false,
          amount_override: "300",
          payment_instructions: "Zelle to me@example.com",
          is_active: true,
        },
      },
    ]);
    expect(screen.queryByRole("header", { name: S.titleNew })).toBeNull();
  });

  it("monthly sends no weekday and resets days before to its own default", async () => {
    const server = await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    await fireEvent.press(screen.getByText(S.monthly));
    expect(field(S.daysBefore).props.value).toBe("3");
    expect(screen.queryByRole("radio", { name: "Sunday" })).toBeNull();

    await save(S.saveNew);

    await screen.findByText(S.savedNew);
    expect(server.writes[0].body).toEqual(expect.objectContaining({ frequency: "monthly", due_weekday: null, send_days_before: 3 }));
  });

  it("changes the send time", async () => {
    const server = await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    await fireEvent.press(screen.getByLabelText(`Change ${S.sendTime.toLowerCase()}`));
    await act(async () => {
      screen.getByTestId(`${S.sendTime}-picker`).props.onChange({ type: "set" }, new Date(2000, 0, 1, 9, 5));
    });
    expect(screen.getByText("9:05 AM")).toBeTruthy();

    await save(S.saveNew);

    await screen.findByText(S.savedNew);
    expect(server.writes[0].body).toEqual(expect.objectContaining({ send_time: "09:05" }));
  });

  it("refuses a time outside the sending window", async () => {
    await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    await fireEvent.press(screen.getByLabelText(`Change ${S.sendTime.toLowerCase()}`));
    await act(async () => {
      screen.getByTestId(`${S.sendTime}-picker`).props.onChange({ type: "set" }, new Date(2000, 0, 1, 22, 0));
    });

    expect(screen.getByText(S.timeHintBad)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: S.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("limits days before by frequency", async () => {
    await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    const saveDisabled = () => screen.getAllByRole("button", { name: S.saveNew }).pop()?.props.accessibilityState.disabled;

    await fireEvent.changeText(field(S.daysBefore), "7");
    expect(screen.getByText("Pick 0 to 6 days.")).toBeTruthy();
    expect(saveDisabled()).toBe(true);
    await fireEvent.changeText(field(S.daysBefore), "");
    expect(saveDisabled()).toBe(true);
    await fireEvent.changeText(field(S.daysBefore), "0");
    expect(saveDisabled()).toBe(false);

    await fireEvent.press(screen.getByText(S.monthly));
    await fireEvent.changeText(field(S.daysBefore), "14");
    expect(saveDisabled()).toBe(false);
    await fireEvent.changeText(field(S.daysBefore), "15");
    expect(screen.getByText("Pick 0 to 14 days.")).toBeTruthy();
  });

  it("needs at least one way to send", async () => {
    await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);

    await fireEvent(screen.getByRole("switch", { name: new RegExp(`^${S.email}`) }), "valueChange", false);

    expect(screen.getByText(S.needChannel)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: S.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("refuses a fixed amount that isn't above zero", async () => {
    await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);

    await fireEvent.changeText(field(S.fixedAmount), "0");

    expect(screen.getByText(S.fixedAmountInvalid)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: S.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("can't turn texts on when the server can't send them", async () => {
    await start(aReminderOverview({ plan: null, sms: { available: false, from_number: "", encrypted: false, webhook_url: "" } }));
    await openSheet(S.titleNew, S.setUp);

    const sms = screen.getByRole("switch", { name: new RegExp(`^${S.sms}`) });
    expect(sms.props.disabled).toBe(true);
    expect(screen.getByText(S.smsUnavailable)).toBeTruthy();
  });

  it.each([
    [409, S.alreadyExists],
    [422, S.cantSave],
    [403, RENT_MANAGE_MESSAGES.viewOnly],
    [404, RENT_MANAGE_MESSAGES.gone],
    [500, RENT_MANAGE_MESSAGES.retry],
    ["lost" as const, RENT_MANAGE_MESSAGES.lostConnection],
  ])("explains a %s answer and keeps the sheet open", async (answer, message) => {
    const server = await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    server.answer = answer;
    server.detail = "server wording that must not show";
    await fireEvent.changeText(field(S.daysBefore), "2");

    await save(S.saveNew);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("server wording that must not show")).toBeNull();
    expect(field(S.daysBefore).props.value).toBe("2");
  });

  it("asks before discarding changes, and closes straight away without any", async () => {
    await start(NO_PLAN);
    await openSheet(S.titleNew, S.setUp);
    const alert = jest.spyOn(Alert, "alert");

    await save(S.cancel);
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByRole("header", { name: S.titleNew })).toBeNull();

    await openSheet(S.titleNew, S.setUp);
    await fireEvent.changeText(field(S.daysBefore), "2");
    await save(S.cancel);
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = (alert.mock.calls[0][2] ?? []) as { text?: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((button) => button.text === "Discard")?.onPress?.();
    });
    expect(screen.queryByRole("header", { name: S.titleNew })).toBeNull();
  });
});

describe("editing reminders", () => {
  const PLAN = aReminderOverview({ plan: aReminderPlan({ frequency: "monthly", due_weekday: null, send_days_before: 3, send_time: "09:30:00", timezone: "America/New_York", sms_enabled: false, payment_instructions: "Venmo", amount_override: "400.00" }) });

  it("starts from the saved plan", async () => {
    await start(PLAN);
    await openSheet(S.titleEdit, S.edit);

    expect(field(S.daysBefore).props.value).toBe("3");
    expect(screen.getByText("9:30 AM")).toBeTruthy();
    expect(field(S.howToPay).props.value).toBe("Venmo");
    expect(field(S.fixedAmount).props.value).toBe("400.00");
    expect(screen.getByRole("switch", { name: new RegExp(`^${S.remindersOn}`) }).props.value).toBe(true);
  });

  it("saves the whole plan with a PUT, keeping its time zone, and clearing blanks to null", async () => {
    const server = await start(PLAN);
    await openSheet(S.titleEdit, S.edit);
    await fireEvent.changeText(field(S.howToPay), "");
    await fireEvent.changeText(field(S.fixedAmount), "");
    await fireEvent(screen.getByRole("switch", { name: new RegExp(`^${S.remindersOn}`) }), "valueChange", false);

    await save(S.saveEdit);

    expect(await screen.findByText(S.savedEdit)).toBeTruthy();
    expect(server.writes).toEqual([
      {
        method: "PUT",
        url: PLAN_URL,
        body: {
          frequency: "monthly",
          due_weekday: null,
          send_days_before: 3,
          send_time: "09:30",
          timezone: "America/New_York",
          email_enabled: true,
          sms_enabled: false,
          amount_override: null,
          payment_instructions: null,
          is_active: false,
        },
      },
    ]);
  });

  it("says when saving fails", async () => {
    const server = await start(PLAN);
    await openSheet(S.titleEdit, S.edit);
    server.answer = 422;
    await fireEvent.changeText(field(S.daysBefore), "4");

    await save(S.saveEdit);

    expect(await screen.findByText(S.cantSave)).toBeTruthy();
  });
});

describe("for someone who can only view", () => {
  it("offers neither setting up nor editing", async () => {
    await start(aReminderOverview({ plan: null }), "viewer");
    expect(screen.queryByText(S.setUp)).toBeNull();
    expect(screen.queryByText(S.edit)).toBeNull();
  });

  it("offers no edit for an existing plan", async () => {
    await start(aReminderOverview(), "viewer");
    await screen.findByText(/Weekly, due every Sunday/);
    expect(screen.queryByText(S.edit)).toBeNull();
  });
});
