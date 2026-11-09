import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { startCalendarServer } from "../test-support/calendarServer";
import { aBookingThisMonth, openBooking } from "../test-support/calendarSheet";
import { holdWrites } from "../test-support/holdWrites";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const NOTES = "Guest name, confirmation code, contact info";

function alertButton(label: string) {
  return jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find((button) => button.text === label);
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("a booking's notes", () => {
  it("shows what's known about the booking", async () => {
    startCalendarServer({ events: [aBookingThisMonth({ source_event_id: "HM123", summary: "Reserved" })] });
    await openBooking();
    expect(await screen.findByText("Booking notes")).toBeTruthy();
    expect(screen.getByText("Source: Airbnb")).toBeTruthy();
    expect(screen.getByText("From channel: Reserved")).toBeTruthy();
    expect(screen.getByText("Channel ID: HM123")).toBeTruthy();
    expect(screen.queryByText(/doesn't share guest details/)).toBeNull();
  });

  it("says when the channel shares no guest details", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    expect(await screen.findByText(/doesn't share guest details/)).toBeTruthy();
  });

  it("saves new notes, trimmed, and says so", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    expect(screen.getByRole("button", { name: "Save notes" })).toBeDisabled();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "  Sam, code HM123  ");
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));

    expect(await screen.findByText("Notes saved.")).toBeTruthy();
    const patch = server.requests.find((request) => request.method === "patch");
    expect(patch!.url).toBe("/listings/blackouts/e1");
    expect(JSON.parse(patch!.data as string)).toEqual({ host_notes: "Sam, code HM123" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save notes" })).toBeDisabled());
  });

  it("clears the notes by sending none", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth({ host_notes: "Old" })] });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "   ");
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    await screen.findByText("Notes saved.");
    expect(JSON.parse(server.requests.find((request) => request.method === "patch")!.data as string)).toEqual({ host_notes: null });
  });

  it("shows a busy button the moment it's pressed", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "x");
    holdWrites();
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it.each([
    [403, "You have view-only access."],
    [404, "I can't find that booking anymore. Pull down to refresh the calendar."],
    [500, "I couldn't save the notes. Want to try again?"],
  ])("says what went wrong on a %i, never shows the server's words, and keeps what was typed", async (status, message) => {
    startCalendarServer({ events: [aBookingThisMonth()], writeFailure: status });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "Keep me");
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByDisplayValue("Keep me")).toBeTruthy();
  });

  it("says so when offline", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "Keep me");
    server.offline = true;
    await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
    expect(await screen.findByText("I couldn't save the notes. Want to try again?")).toBeTruthy();
  });

  it("asks before closing with unsaved notes, and each choice does what it says", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "Unsaved");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(Alert.alert).toHaveBeenCalledWith("Save your notes?", "I haven't saved them yet.", expect.any(Array));
    expect(screen.getByText("Booking notes")).toBeTruthy();

    await act(async () => alertButton("Save")?.onPress?.());
    await waitFor(() => expect(screen.queryByText("Booking notes")).toBeNull());
  });

  it("discards unsaved notes on request", async () => {
    const server = startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "Unsaved");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await act(async () => alertButton("Discard")?.onPress?.());
    await waitFor(() => expect(screen.queryByText("Booking notes")).toBeNull());
    expect(server.requests.some((request) => request.method === "patch")).toBe(false);
  });

  it("stays open if the save from the prompt fails", async () => {
    startCalendarServer({ events: [aBookingThisMonth()], writeFailure: 500 });
    await openBooking();
    await fireEvent.changeText(await screen.findByLabelText(NOTES), "Unsaved");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await act(async () => alertButton("Save")?.onPress?.());
    expect(await screen.findByText("I couldn't save the notes. Want to try again?")).toBeTruthy();
    expect(screen.getByText("Booking notes")).toBeTruthy();
  });

  it("closes without asking when nothing changed", async () => {
    startCalendarServer({ events: [aBookingThisMonth()] });
    await openBooking();
    await screen.findByText("Booking notes");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Booking notes")).toBeNull());
  });

  it("lets someone who can only read see the notes but not change them", async () => {
    startCalendarServer({ events: [aBookingThisMonth({ host_notes: "Sam, code HM123" })], role: "viewer" });
    await openBooking();
    expect(await screen.findByText("Sam, code HM123")).toBeTruthy();
    expect(screen.queryByLabelText(NOTES)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull();
    expect(screen.getByText("You have view-only access.")).toBeTruthy();
  });

  it("says there are no notes for a viewer when empty", async () => {
    startCalendarServer({ events: [aBookingThisMonth()], role: "viewer" });
    await openBooking();
    expect(await screen.findByText("No notes yet.")).toBeTruthy();
  });

  it("explains a lease's dates and offers the lease, not notes", async () => {
    startCalendarServer({ events: [aBookingThisMonth({ id: "lease1", source: "lease", summary: "Dana Reed" })] });
    await openBooking("Maple Room");
    expect(await screen.findByText("These dates come from a signed lease, so they aren't editable here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open lease" })).toBeTruthy();
    expect(screen.queryByText("Booking notes")).toBeNull();
    expect(screen.queryByText("Attachments")).toBeNull();
  });
});
