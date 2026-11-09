import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { RENT_MANAGE_MESSAGES } from "../src/constants/rentManage";
import TenantRent from "../src/features/rent/TenantRent";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aRentCharge, aRentLedger, aRentPeriod, aRentSchedule } from "../test-support/aRentLedger";
import { startRentWritesServer, type RentWritesServer } from "../test-support/rentWritesServer";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;
const M = RENT_MANAGE_MESSAGES;
const editSchedule = /^Edit schedule, /;

const SCHEDULED = aRentLedger({ schedules: [aRentSchedule()], current_period: aRentPeriod(), charges: [aRentCharge()], balance: "750.00" });
const ONE_OFF = aRentCharge({ id: "c2", schedule_id: null, charge_type: "late_fee", amount: "50.00", allocated: "0.00", remaining: "50.00", status: "open", due_date: "2026-03-05" });
const WAIVED = aRentCharge({ id: "c3", status: "waived", waived_at: "2026-03-02T12:00:00Z", waived_reason: "Broken boiler", allocated: "0.00" });

async function renderRent(server: RentWritesServer) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TenantRent applicantId="a1" />
      </ToastProvider>
    </Provider>,
  );
  await act(async () => {
    while (server.workspaceReads === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pickDate(label: string, date: Date) {
  if (!screen.queryByTestId(`${label}-picker`)) await fireEvent.press(screen.getByLabelText(new RegExp(`^(Choose|Change) ${label.toLowerCase().replace(/[()]/g, "\\$&")}$`)));
  await act(async () => {
    screen.getByTestId(`${label}-picker`).props.onChange({ type: "set" }, date);
  });
}

/** A field's accessibility label is its label plus ", required" when it must be filled. */
function field(label: string) {
  return screen.getByLabelText(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(, required)?$`));
}

async function typeInto(label: string, text: string) {
  await fireEvent.changeText(field(label), text);
}

/** Presses the last button with this name: a sheet's save button comes after the screen's own button of the same name. */
async function pressLast(name: string) {
  const buttons = screen.getAllByRole("button", { name });
  await fireEvent.press(buttons[buttons.length - 1]);
}

async function answerAlert(alert: jest.SpyInstance, buttonText: string) {
  const buttons = (alert.mock.calls[alert.mock.calls.length - 1][2] ?? []) as { text?: string; onPress?: () => void }[];
  await act(async () => {
    buttons.find((button) => button.text === buttonText)?.onPress?.();
  });
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

describe("setting rent up", () => {
  async function openNewSchedule() {
    const server = startRentWritesServer(aRentLedger());
    await renderRent(server);
    await fireEvent.press(await screen.findByText(M.setUp));
    await screen.findByRole("header", { name: M.scheduleTitleNew });
    return server;
  }

  it("can't be saved without an amount and a start date", async () => {
    await openNewSchedule();
    const save = screen.getAllByRole("button", { name: M.saveNew }).pop();
    expect(save?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await typeInto(M.amount, "1200");
    expect(screen.getAllByRole("button", { name: M.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await pickDate(M.start, new Date(2026, 3, 1));
    expect(screen.getAllByRole("button", { name: M.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it("sends what was entered and says it saved", async () => {
    const server = await openNewSchedule();
    await typeInto(M.amount, "1200");
    await fireEvent.press(screen.getByText("Every 2 weeks"));
    await pickDate(M.start, new Date(2026, 3, 1));
    await typeInto(M.grace, "5");
    await typeInto(M.notes, "  Pays on the 3rd  ");

    await pressLast(M.saveNew);

    expect(await screen.findByText(M.scheduleSaved)).toBeTruthy();
    expect(server.writes).toHaveLength(1);
    expect(server.writes[0]).toEqual({
      method: "POST",
      url: "/rent-ledger/schedules",
      body: expect.objectContaining({ applicant_id: "a1", amount: "1200", cadence: "biweekly", start_date: "2026-04-01", end_date: null, grace_days: 5, notes: "Pays on the 3rd" }),
    });
    expect(screen.queryByRole("header", { name: M.scheduleTitleNew })).toBeNull();
  });

  it("refuses a last day before the first day, and a grace period that isn't a number of days", async () => {
    await openNewSchedule();
    await typeInto(M.amount, "1200");
    await pickDate(M.start, new Date(2026, 3, 10));
    await pickDate(M.end, new Date(2026, 3, 1));
    expect(screen.getByText(M.endBeforeStart)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: M.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await pickDate(M.end, new Date(2026, 3, 30));
    expect(screen.queryByText(M.endBeforeStart)).toBeNull();
    await typeInto(M.grace, "400");
    expect(screen.getByText(M.graceInvalid)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: M.saveNew }).pop()?.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it.each([
    [409, M.scheduleOverlaps],
    [422, M.scheduleBadDates],
    [403, M.viewOnly],
    [404, M.gone],
    [500, M.retry],
    ["lost" as const, M.lostConnection],
  ])("explains a %s answer in its own words and keeps what was typed", async (answer, message) => {
    const server = await openNewSchedule();
    server.answer = answer;
    server.detail = "server wording that must not show";
    await typeInto(M.amount, "1200");
    await pickDate(M.start, new Date(2026, 3, 1));

    await pressLast(M.saveNew);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("server wording that must not show")).toBeNull();
    expect(field(M.amount).props.value).toBe("1200");
    expect(screen.getByRole("header", { name: M.scheduleTitleNew })).toBeTruthy();
  });

  it("says demo accounts can't change rent", async () => {
    const server = await openNewSchedule();
    server.answer = 403;
    server.detail = "This feature is not available for demo accounts";
    await typeInto(M.amount, "1200");
    await pickDate(M.start, new Date(2026, 3, 1));

    await pressLast(M.saveNew);

    expect(await screen.findByText(M.demo)).toBeTruthy();
  });

  it("asks before throwing away what was typed", async () => {
    await openNewSchedule();
    const alert = jest.spyOn(Alert, "alert");
    await typeInto(M.amount, "1200");

    await pressLast(M.cancel);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("header", { name: M.scheduleTitleNew })).toBeTruthy();

    await answerAlert(alert, "Discard");
    expect(screen.queryByRole("header", { name: M.scheduleTitleNew })).toBeNull();
  });

  it("closes straight away when nothing was typed", async () => {
    await openNewSchedule();
    const alert = jest.spyOn(Alert, "alert");

    await pressLast(M.cancel);

    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByRole("header", { name: M.scheduleTitleNew })).toBeNull();
  });
});

describe("editing and removing a schedule", () => {
  async function openEdit(ledger = SCHEDULED) {
    const server = startRentWritesServer(ledger);
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(editSchedule));
    await screen.findByRole("header", { name: M.scheduleTitleEdit });
    return server;
  }

  it("fixes the amount and cadence, since a rent change is a new schedule", async () => {
    await openEdit();

    expect(screen.getByText(/^\$1,500\.00 .*starting March 1, 2026\. To change the rent, end this schedule/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Rent amount/)).toBeNull();
    expect(screen.queryByLabelText(M.cadence)).toBeNull();
  });

  it("sends only the end, grace and notes, with cleared values as explicit nulls", async () => {
    const server = await openEdit(aRentLedger({ ...SCHEDULED, schedules: [aRentSchedule({ end_date: "2026-08-31", grace_days: 5, notes: "Old note" })] }));
    await fireEvent.press(screen.getByLabelText(`Clear ${M.end.toLowerCase()}`));
    await typeInto(M.grace, "");
    await typeInto(M.notes, "");

    await pressLast(M.saveEdit);

    expect(await screen.findByText(M.scheduleUpdated)).toBeTruthy();
    expect(server.writes[0].method).toBe("PATCH");
    expect(server.writes[0].url).toBe("/rent-ledger/schedules/s1");
    expect(server.writes[0].body).toEqual(expect.objectContaining({ end_date: null, grace_days: null, notes: null }));
    expect(server.writes[0].body).not.toHaveProperty("amount");
    expect(server.writes[0].body).not.toHaveProperty("cadence");
  });

  it("ends a schedule on the day picked", async () => {
    const server = await openEdit();
    await pickDate(M.end, new Date(2026, 5, 30));

    await pressLast(M.saveEdit);

    await screen.findByText(M.scheduleUpdated);
    expect(server.writes[0].body).toEqual(expect.objectContaining({ end_date: "2026-06-30" }));
  });

  it("explains an overlap or a last day before the first day", async () => {
    const server = await openEdit();
    await pickDate(M.end, new Date(2026, 5, 30));
    server.answer = 409;
    await pressLast(M.saveEdit);
    expect(await screen.findByText(M.scheduleOverlaps)).toBeTruthy();

    server.answer = 422;
    await pressLast(M.saveEdit);
    expect(await screen.findByText(M.scheduleBadDates)).toBeTruthy();
  });

  it("confirms before removing, and removes only on yes", async () => {
    const server = await openEdit();
    const alert = jest.spyOn(Alert, "alert");

    await pressLast(M.removeSchedule);
    expect(alert.mock.calls[0][0]).toBe(M.removeScheduleTitle);
    expect(server.writes).toHaveLength(0);

    await answerAlert(alert, M.confirmRemove);

    expect(await screen.findByText(M.scheduleRemoved)).toBeTruthy();
    expect(server.writes).toEqual([{ method: "DELETE", url: "/rent-ledger/schedules/s1", body: null }]);
    expect(screen.queryByRole("header", { name: M.scheduleTitleEdit })).toBeNull();
  });

  it("keeps the sheet open and says so when removing fails", async () => {
    const server = await openEdit();
    server.answer = 404;
    const alert = jest.spyOn(Alert, "alert");

    await pressLast(M.removeSchedule);
    await answerAlert(alert, M.confirmRemove);

    expect(await screen.findByText(M.gone)).toBeTruthy();
    expect(screen.getByRole("header", { name: M.scheduleTitleEdit })).toBeTruthy();
  });
});

describe("adding a charge", () => {
  async function openCharge() {
    const server = startRentWritesServer(SCHEDULED);
    await renderRent(server);
    await fireEvent.press(await screen.findByText(M.addCharge));
    await screen.findByRole("header", { name: M.chargeTitle });
    return server;
  }

  it("offers every kind except rent, with late fee chosen", async () => {
    await openCharge();

    expect(screen.getByText("Late fee")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Rent" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Late fee" }).props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
  });

  it("needs an amount above zero and a due date", async () => {
    await openCharge();
    const isDisabled = () => screen.getAllByRole("button", { name: M.addCharge }).pop()?.props.accessibilityState.disabled;
    expect(isDisabled()).toBe(true);

    await typeInto(M.chargeAmount, "0");
    await pickDate(M.chargeDue, new Date(2026, 3, 5));
    expect(isDisabled()).toBe(true);

    await typeInto(M.chargeAmount, "50");
    expect(isDisabled()).toBe(false);
  });

  it("sends the charge as entered and says it was added", async () => {
    const server = await openCharge();
    await typeInto(M.chargeAmount, "50");
    await pickDate(M.chargeDue, new Date(2026, 3, 5));
    await typeInto(M.chargeDescription, "  April late fee ");

    await pressLast(M.addCharge);

    expect(await screen.findByText(M.chargeAdded)).toBeTruthy();
    expect(server.writes).toEqual([
      { method: "POST", url: "/rent-ledger/charges", body: { applicant_id: "a1", amount: "50", due_date: "2026-04-05", charge_type: "late_fee", description: "April late fee" } },
    ]);
  });

  it("sends the kind that was chosen, and no description when blank", async () => {
    const server = await openCharge();
    await typeInto(M.chargeAmount, "75");
    await pickDate(M.chargeDue, new Date(2026, 3, 5));
    await fireEvent.press(screen.getByText("Utilities"));

    await pressLast(M.addCharge);

    await screen.findByText(M.chargeAdded);
    expect(server.writes[0].body).toEqual(expect.objectContaining({ charge_type: "utility_reimbursement", description: null }));
  });

  it.each([
    [422, M.chargeInvalid],
    [403, M.viewOnly],
    ["lost" as const, M.lostConnection],
    [500, M.retry],
  ])("explains a %s answer and keeps the sheet open", async (answer, message) => {
    const server = await openCharge();
    server.answer = answer;
    await typeInto(M.chargeAmount, "50");
    await pickDate(M.chargeDue, new Date(2026, 3, 5));

    await pressLast(M.addCharge);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(field(M.chargeAmount).props.value).toBe("50");
  });

  it("asks before discarding a half-filled charge", async () => {
    await openCharge();
    const alert = jest.spyOn(Alert, "alert");
    await typeInto(M.chargeAmount, "50");

    await pressLast(M.cancel);
    expect(alert).toHaveBeenCalledTimes(1);

    await answerAlert(alert, "Discard");
    expect(screen.queryByRole("header", { name: M.chargeTitle })).toBeNull();
  });
});

describe("waiving, restoring and removing a charge", () => {
  const rentCharge = /^Rent, March 1/;

  it("needs a reason to waive, then sends it trimmed", async () => {
    const server = startRentWritesServer(SCHEDULED);
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(rentCharge));
    await fireEvent.press(screen.getByLabelText(/^Waive, /));
    await screen.findByRole("header", { name: M.waiveTitle });
    const waive = () => screen.getByRole("button", { name: M.waiveCharge });
    expect(waive().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await typeInto(M.waiveReason, "   ");
    expect(waive().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await typeInto(M.waiveReason, " Broken boiler ");
    await fireEvent.press(waive());

    expect(await screen.findByText(M.chargeWaived)).toBeTruthy();
    expect(server.writes).toEqual([{ method: "POST", url: "/rent-ledger/charges/c1/waive", body: { reason: "Broken boiler" } }]);
    expect(screen.queryByRole("header", { name: M.waiveTitle })).toBeNull();
  });

  it("keeps the reason when waiving fails", async () => {
    const server = startRentWritesServer(SCHEDULED);
    server.answer = 500;
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(rentCharge));
    await fireEvent.press(screen.getByLabelText(/^Waive, /));
    await typeInto(M.waiveReason, "Broken boiler");

    await fireEvent.press(screen.getByRole("button", { name: M.waiveCharge }));

    expect(await screen.findByText(M.retry)).toBeTruthy();
    expect(field(M.waiveReason).props.value).toBe("Broken boiler");
  });

  it("restores a waived charge", async () => {
    const server = startRentWritesServer(aRentLedger({ charges: [WAIVED] }));
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(/Waived: Broken boiler$/));

    await fireEvent.press(screen.getByLabelText(/^Restore, /));

    expect(await screen.findByText(M.chargeRestored)).toBeTruthy();
    expect(server.writes).toEqual([{ method: "DELETE", url: "/rent-ledger/charges/c3/waive", body: null }]);
  });

  it("says when a restore fails", async () => {
    const server = startRentWritesServer(aRentLedger({ charges: [WAIVED] }));
    server.answer = "lost";
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(/Waived: Broken boiler$/));

    await fireEvent.press(screen.getByLabelText(/^Restore, /));

    expect(await screen.findByText(M.lostConnection)).toBeTruthy();
  });

  it("removes a one-off charge only after confirming", async () => {
    const server = startRentWritesServer(aRentLedger({ charges: [ONE_OFF] }));
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(/^Late fee, due March 5/));
    const alert = jest.spyOn(Alert, "alert");

    await fireEvent.press(screen.getByLabelText(/^Remove charge, /));
    expect(alert.mock.calls[0][0]).toBe(M.removeChargeTitle);
    expect(server.writes).toHaveLength(0);
    await answerAlert(alert, M.confirmRemove);

    expect(await screen.findByText(M.chargeRemoved)).toBeTruthy();
    expect(server.writes).toEqual([{ method: "DELETE", url: "/rent-ledger/charges/c2", body: null }]);
  });

  it("says when removing a charge fails", async () => {
    const server = startRentWritesServer(aRentLedger({ charges: [ONE_OFF] }));
    server.answer = 404;
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(/^Late fee, due March 5/));
    const alert = jest.spyOn(Alert, "alert");

    await fireEvent.press(screen.getByLabelText(/^Remove charge, /));
    await answerAlert(alert, M.confirmRemove);

    expect(await screen.findByText(M.gone)).toBeTruthy();
  });

  it("explains that rent from the schedule can be waived but not removed", async () => {
    const server = startRentWritesServer(SCHEDULED);
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(rentCharge));

    expect(screen.getByText(M.removeChargeOnlyOneOff)).toBeTruthy();
    expect(screen.queryByLabelText(/^Remove charge, /)).toBeNull();
  });
});

describe("for someone who can only view", () => {
  it("shows the charges but none of the rent actions", async () => {
    const server = startRentWritesServer(aRentLedger({ ...SCHEDULED, charges: [aRentCharge(), ONE_OFF] }), "viewer");
    await renderRent(server);
    await fireEvent.press(await screen.findByLabelText(/^Rent, March 1/));
    await fireEvent.press(screen.getByLabelText(/^Late fee, due March 5/));

    expect(screen.queryByText(M.addCharge)).toBeNull();
    expect(screen.queryByLabelText(editSchedule)).toBeNull();
    expect(screen.queryByLabelText(/^Waive, /)).toBeNull();
    expect(screen.queryByLabelText(/^Remove charge, /)).toBeNull();
  });
});
