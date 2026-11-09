import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { propertiesApi } from "@mybookkeeper/api-client/store/propertiesApi";
import { filterSummary, hasCalendarFilters, NO_CALENDAR_FILTERS, toggleValue, withKnownProperties } from "../src/features/calendar/calendarFilters";
import { monthFromParts, yearBounds } from "../src/features/calendar/calendarJump";
import CalendarScreen from "../src/features/calendar/CalendarScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { monthOf, shiftMonth } from "../src/lib/localDate";
import { store } from "../src/lib/store";
import { anEvent, startCalendarServer } from "../test-support/calendarServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const THIS_MONTH = monthOf(new Date());
const TWO_PROPERTIES = [{ id: "p1", name: "Elm House" }, { id: "p2", name: "Oak Flat" }];
const FILTERS_BUTTON = /^Filters, currently/;

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CalendarScreen />
      </ToastProvider>
    </Provider>,
  );
}

function thisMonthsBooking() {
  return anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) });
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("calendar filter helpers", () => {
  it("toggles a value in and out without touching the others", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("knows when something is filtered", () => {
    expect(hasCalendarFilters(NO_CALENDAR_FILTERS)).toBe(false);
    expect(hasCalendarFilters({ propertyIds: [], sources: ["airbnb"] })).toBe(true);
    expect(hasCalendarFilters({ propertyIds: ["p1"], sources: [] })).toBe(true);
  });

  it("drops properties that are gone, and keeps the same object when none are", () => {
    const filters = { propertyIds: ["p1", "p9"], sources: ["vrbo"] };
    expect(withKnownProperties(filters, ["p1"])).toEqual({ propertyIds: ["p1"], sources: ["vrbo"] });
    expect(withKnownProperties(filters, ["p1", "p9"])).toBe(filters);
  });

  it("summarises the choices in a few words", () => {
    expect(filterSummary(NO_CALENDAR_FILTERS, TWO_PROPERTIES)).toBe("Filters");
    expect(filterSummary({ propertyIds: ["p2"], sources: [] }, TWO_PROPERTIES)).toBe("Oak Flat");
    expect(filterSummary({ propertyIds: ["p1", "p2"], sources: ["airbnb", "vrbo"] }, TWO_PROPERTIES)).toBe("2 properties, 2 sources");
    expect(filterSummary({ propertyIds: [], sources: ["airbnb"] }, TWO_PROPERTIES)).toBe("Airbnb");
  });

  it("builds months and year limits for the jump", () => {
    expect(monthFromParts(2026, 3)).toBe("2026-03-01");
    expect(yearBounds("2026-11-01", 2, 5)).toEqual({ first: 2024, last: 2031 });
  });
});

describe("filtering the calendar", () => {
  it("filters by property, several at once", async () => {
    const server = startCalendarServer({ properties: TWO_PROPERTIES, events: [thisMonthsBooking()] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: FILTERS_BUTTON }));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Oak Flat" }));
    await waitFor(() => expect(server.requests.filter((request) => request.url === "/calendar/events").at(-1)!.params.property_ids).toBe("p2"));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Elm House" }));
    await waitFor(() => expect(server.requests.filter((request) => request.url === "/calendar/events").at(-1)!.params.property_ids).toBe("p2,p1"));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("button", { name: "Filters, currently 2 properties" })).toBeTruthy();
  });

  it("filters by booking source", async () => {
    const server = startCalendarServer({ properties: TWO_PROPERTIES, events: [thisMonthsBooking()] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: FILTERS_BUTTON }));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Airbnb" }));
    await waitFor(() => expect(server.requests.filter((request) => request.url === "/calendar/events").at(-1)!.params.sources).toBe("airbnb"));
    expect(screen.getByRole("checkbox", { name: "Airbnb" })).toBeChecked();
  });

  it("clears every filter from the sheet", async () => {
    startCalendarServer({ properties: TWO_PROPERTIES, events: [thisMonthsBooking()] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: FILTERS_BUTTON }));
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Oak Flat" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Airbnb" }));
    await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("button", { name: "Filters, currently none" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Oak Flat" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Airbnb" })).not.toBeChecked();
  });

  it("offers no property section with a single property, but still the sources", async () => {
    startCalendarServer({ properties: [TWO_PROPERTIES[0]], events: [thisMonthsBooking()] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: FILTERS_BUTTON }));
    expect(screen.queryByText("Properties")).toBeNull();
    expect(screen.getByText("Sources")).toBeTruthy();
  });

  it("says nothing matches, and clears the filters from there", async () => {
    const server = startCalendarServer({ properties: TWO_PROPERTIES, events: [thisMonthsBooking()] });
    await renderScreen();
    await screen.findByText("Maple Room");
    server.events = [];
    await fireEvent.press(await screen.findByRole("button", { name: FILTERS_BUTTON }));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Oak Flat" }));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("No bookings match these filters.")).toBeTruthy();
    server.events = [thisMonthsBooking()];
    await fireEvent.press(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Maple Room")).toBeTruthy();
  });

  it("stops filtering by a property that's gone", async () => {
    const server = startCalendarServer({ properties: TWO_PROPERTIES, events: [thisMonthsBooking()] });
    await renderScreen();
    await screen.findByText("Maple Room");
    await fireEvent.press(await screen.findByRole("button", { name: FILTERS_BUTTON }));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Oak Flat" }));
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    server.properties = [TWO_PROPERTIES[0]];
    await act(async () => {
      await store.dispatch(propertiesApi.endpoints.getProperties.initiate(undefined, { forceRefetch: true }));
    });
    expect(await screen.findByRole("button", { name: "Filters, currently none" })).toBeTruthy();
  });
});

describe("jumping to a month", () => {
  it("opens from the month title, and goes to the month and year picked", async () => {
    const server = startCalendarServer({ events: [thisMonthsBooking()] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /Jump to another month or year|\d{4}/ }));
    const year = Number(THIS_MONTH.slice(0, 4));
    await fireEvent.press(await screen.findByRole("button", { name: "Next year" }));
    await fireEvent.press(screen.getByRole("radio", { name: "March" }));
    await waitFor(() => expect(server.requests.filter((request) => request.url === "/calendar/events").at(-1)!.params.from).toBe(`${year + 1}-03-01`));
    expect(screen.queryByText("Jump to a month")).toBeNull();
  });

  it("stops the year arrows at the ends", async () => {
    startCalendarServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /Jump to another month or year|\d{4}/ }));
    for (let step = 0; step < 2; step += 1) await fireEvent.press(screen.getByRole("button", { name: "Previous year" }));
    expect(screen.getByRole("button", { name: "Previous year" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next year" })).toBeEnabled();
  });
});

describe("last synced", () => {
  it("shows when the calendar last changed, or a dash with no bookings", async () => {
    startCalendarServer({ events: [thisMonthsBooking()] });
    await renderScreen();
    expect(await screen.findByText(/^Last synced: /)).toBeTruthy();
  });
});
