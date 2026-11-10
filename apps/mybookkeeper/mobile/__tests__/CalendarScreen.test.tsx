import { calendarApi } from "@mybookkeeper/api-client/store/calendarApi";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { AccessibilityInfo, Platform } from "react-native";
import { Provider } from "react-redux";
import {
  calendarSections,
  continuesInto,
  eventPlace,
  sectionToOpenAt,
  stayDates,
  stayLength,
} from "../src/features/calendar/calendarDisplay";
import CalendarEventSheet from "../src/features/calendar/CalendarEventSheet";
import CalendarScreen from "../src/features/calendar/CalendarScreen";
import { useOpenAtSection } from "../src/features/calendar/useOpenAtSection";
import { CALENDAR_OPEN_RETRY_LIMIT, CALENDAR_OPEN_RETRY_MS } from "../src/constants/calendar";
import { monthOf, shiftMonth } from "../src/lib/localDate";
import { store } from "../src/lib/store";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path) },
}));

const mockModal: { onDismiss?: () => void } = {};

jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));

const originalAdapter = api.defaults.adapter;

function anEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1",
    listing_id: "li1",
    listing_name: "Maple Room",
    property_id: "p1",
    property_name: "Elm House",
    starts_on: "2026-11-10",
    ends_on: "2026-11-14",
    source: "airbnb",
    source_event_id: "x",
    summary: null,
    host_notes: null,
    attachment_count: 0,
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

const aLeaseEvent = (overrides: Partial<CalendarEvent> = {}) =>
  anEvent({ id: "lease1", source: "lease", summary: "Dana Reed", starts_on: "2026-11-05", ends_on: "2026-11-10", ...overrides });

interface Server {
  events: CalendarEvent[] | "fail";
  properties: { id: string; name: string }[];
  listingsTotal: number;
  reviewCount: number;
  requests: AxiosRequestConfig[];
}

function startServer(overrides: Partial<Server> = {}): Server {
  const server: Server = { events: [], properties: [], listingsTotal: 1, reviewCount: 0, requests: [], ...overrides };
  const adapter: AxiosAdapter = async (config) => {
    const respond = (data: unknown, status = 200) => {
      if (status >= 400) return Promise.reject({ response: { status, data }, config, isAxiosError: true });
      return { data, status, statusText: "OK", headers: {}, config };
    };
    if (config.url === "/calendar/events") {
      server.requests.push(config);
      return server.events === "fail" ? respond({ detail: "down" }, 500) : respond(server.events);
    }
    if (config.url === "/calendar/review-queue/count") return respond(server.reviewCount);
    if (config.url === "/properties") return respond(server.properties);
    if (config.url === "/listings") return respond({ items: [], total: server.listingsTotal, has_more: false });
    return respond({ detail: "not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

/** The bookings never answer, so the screen stays waiting on them. */
function holdEvents(): void {
  const answered = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) => (config.url === "/calendar/events" ? new Promise(() => undefined) : answered(config));
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CalendarScreen />
      </ToastProvider>
    </Provider>,
  );
}

const THIS_MONTH = monthOf(new Date());

beforeEach(() => {
  mockPush.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("calendarDisplay", () => {
  it("counts a booking in nights and shows the check-out day", () => {
    const booking = anEvent();
    expect(stayLength(booking)).toBe("4 nights");
    expect(stayDates(booking)).toBe("Nov 10 – Nov 14");
  });

  it("shows a lease's real last day, not the day after it that the server sends", () => {
    const lease = aLeaseEvent();
    expect(stayDates(lease)).toBe("Nov 5 – Nov 9");
    expect(stayLength(lease)).toBe("5 days");
  });

  it("doesn't drift a day from a time zone, at the edge of a month", () => {
    expect(stayDates(anEvent({ starts_on: "2026-11-01", ends_on: "2026-12-01" }))).toBe("Nov 1 – Dec 1");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("names the missing link for a lease with no listing", () => {
    const unlinked = aLeaseEvent({ listing_id: null, listing_name: null, property_id: null, property_name: null });
    expect(eventPlace(unlinked)).toBe("No listing linked · Tenant");
  });

  it("only says a stay continues when it's there after the month ends", () => {
    expect(continuesInto(anEvent({ ends_on: "2026-12-01" }), "2026-11-01")).toBeNull();
    expect(continuesInto(anEvent({ ends_on: "2026-12-02" }), "2026-11-01")).toBe("continues into December");
  });

  it("puts earlier stays first, then groups by check-in date in order", () => {
    const sections = calendarSections(
      [
        anEvent({ id: "later", starts_on: "2026-11-20", ends_on: "2026-11-22" }),
        anEvent({ id: "same1" }),
        anEvent({ id: "same2" }),
        anEvent({ id: "before", starts_on: "2026-10-28", ends_on: "2026-11-03" }),
      ],
      "2026-11-01",
      "2026-11-20",
    );
    expect(sections.map((section) => section.data.map((event) => event.id))).toEqual([["before"], ["same1", "same2"], ["later"]]);
    expect(sections[0]!.title).toBe("Already here from before November");
    expect(sections[2]!.title).toBe("Today, Nov 20");
  });

  it("opens at today's check-ins or the next ones, and stays at the top when that's already first", () => {
    const sections = calendarSections(
      [anEvent({ id: "a", starts_on: "2026-11-03", ends_on: "2026-11-04" }), anEvent({ id: "b", starts_on: "2026-11-20", ends_on: "2026-11-22" })],
      "2026-11-01",
      "2026-11-10",
    );
    expect(sectionToOpenAt(sections, "2026-11-10")).toBe(1);
    expect(sectionToOpenAt(sections, "2026-11-01")).toBeNull();
    expect(sectionToOpenAt(sections, "2026-11-25")).toBeNull();
  });
});

describe("CalendarScreen", () => {
  it("asks for the whole of this month", async () => {
    const server = startServer({ events: [anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await screen.findByText("Maple Room");
    expect(server.requests[0]!.params).toEqual({ from: THIS_MONTH, to: shiftMonth(THIS_MONTH, 1) });
  });

  it("shows a skeleton while the first answer is on its way", async () => {
    startServer();
    holdEvents();
    await renderScreen();
    expect(await screen.findByTestId("calendar-skeleton")).toBeTruthy();
  });

  it("takes last month's bookings down while the next month loads", async () => {
    startServer({ events: [anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await screen.findByText("Maple Room");
    holdEvents();
    await fireEvent.press(screen.getByRole("button", { name: /^Next month/ }));
    expect(await screen.findByTestId("calendar-skeleton")).toBeTruthy();
    expect(screen.queryByText("Maple Room")).toBeNull();
  });

  it("pins a stay that began before the month above the rest", async () => {
    startServer({ events: [anEvent({ starts_on: shiftMonth(THIS_MONTH, -1), ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await screen.findByText(/^Already here from before/);
  });

  it("says how many bookings a month has when it changes, and says so when it can't load", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const server = startServer({ events: [anEvent()] });
    await renderScreen();
    await screen.findByText("Maple Room");
    await fireEvent.press(screen.getByRole("button", { name: /^Next month/ }));
    await waitFor(() => expect(announce).toHaveBeenCalledWith(expect.stringContaining("1 booking")));
    server.events = "fail";
    await fireEvent.press(screen.getByRole("button", { name: /^Next month/ }));
    await waitFor(() => expect(announce).toHaveBeenCalledWith("I couldn't load the calendar."));
  });

  it("keeps what it had and says so when a reload fails", async () => {
    const server = startServer({ events: [anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await screen.findByText("Maple Room");
    server.events = "fail";
    await act(async () => {
      await store.dispatch(
        calendarApi.endpoints.getCalendarEvents.initiate(
          { from: THIS_MONTH, to: shiftMonth(THIS_MONTH, 1), property_ids: [], sources: [] },
          { forceRefetch: true },
        ),
      );
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Maple Room")).toBeTruthy();
  });

  it("moves between months, offers Today once away, and says what it found", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const server = startServer();
    await renderScreen();
    await screen.findByText(/Nothing booked/);
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: /^Next month/ }));
    await waitFor(() => expect(server.requests.at(-1)!.params.from).toBe(shiftMonth(THIS_MONTH, 1)));
    await waitFor(() => expect(announce).toHaveBeenCalledWith(expect.stringContaining("no bookings")));

    await fireEvent.press(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Today" })).toBeNull());
    announce.mockRestore();
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer({ events: "fail" });
    await renderScreen();
    await screen.findByText("I couldn't load the calendar.");
    server.events = [anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Maple Room");
  });

  it("says there are no listings only when the month is empty too", async () => {
    startServer({ listingsTotal: 0 });
    await renderScreen();
    await screen.findByText("I don't see any listings yet.");
  });

  it("shows bookings rather than the no listings message when there are any", async () => {
    startServer({ listingsTotal: 0, events: [anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await screen.findByText("Maple Room");
    expect(screen.queryByText("I don't see any listings yet.")).toBeNull();
  });

  it("shows a booking's details and notes, with no lease to open", async () => {
    startServer({ events: [anEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1), host_notes: "Late arrival" })] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Maple Room/ }));
    await screen.findByText("Late arrival");
    expect(screen.getAllByText("Elm House · Airbnb")).toHaveLength(2);
    expect(screen.getByText(/^Last synced Nov 1, 2026 \(/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open lease" })).toBeNull();
  });

  it("leaves a lease's notes out of its sheet", async () => {
    startServer({ events: [aLeaseEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1), host_notes: "Not for here" })] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Dana Reed/ }));
    await screen.findByRole("button", { name: "Open lease" });
    expect(screen.queryByText("Not for here")).toBeNull();
  });

  it("on iPhone, waits for the sheet to go before opening a tenant's lease", async () => {
    startServer({ events: [aLeaseEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Dana Reed/ }));
    await fireEvent.press(await screen.findByRole("button", { name: "Open lease" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Open lease" })).toBeNull());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("on Android, where a sheet can't say it has gone, opens a tenant's lease when it closes", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    startServer({ events: [aLeaseEvent({ starts_on: THIS_MONTH, ends_on: shiftMonth(THIS_MONTH, 1) })] });
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Dana Reed/ }));
    await fireEvent.press(await screen.findByRole("button", { name: "Open lease" }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/leases/lease1"));
  });
});

describe("CalendarEventSheet", () => {
  it("on iPhone, says it has closed only when the sheet has finished going", async () => {
    startServer();
    const onClosed = jest.fn();
    const sheet = (isOpen: boolean) => (
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <CalendarEventSheet event={aLeaseEvent()} isOpen={isOpen} onClose={jest.fn()} onClosed={onClosed} onOpenLease={jest.fn()} />
        </ToastProvider>
      </Provider>
    );
    await render(sheet(true));
    const dismissed = mockModal.onDismiss as () => void;
    await screen.rerender(sheet(false));
    expect(onClosed).not.toHaveBeenCalled();
    dismissed();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});

describe("useOpenAtSection", () => {
  type Hook = { openKey: string | null; section: number | null };

  async function start(initial: Hook) {
    const scrollToLocation = jest.fn();
    const list = { current: { scrollToLocation } } as unknown as Parameters<typeof useOpenAtSection>[0];
    const hook = await renderHook(({ openKey, section }: Hook) => useOpenAtSection(list, openKey, section), { initialProps: initial });
    return { scrollToLocation, ...hook };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("scrolls once when the data arrives, not again on a refresh", async () => {
    const { scrollToLocation, rerender } = await start({ openKey: null, section: null });
    expect(scrollToLocation).not.toHaveBeenCalled();
    await rerender({ openKey: "2026-11-01", section: 2 });
    expect(scrollToLocation).toHaveBeenCalledTimes(1);
    expect(scrollToLocation).toHaveBeenCalledWith({ sectionIndex: 2, itemIndex: 0, animated: false });
    await rerender({ openKey: "2026-11-01", section: 3 });
    expect(scrollToLocation).toHaveBeenCalledTimes(1);
  });

  it("tries again when the list hadn't measured the row, then gives up", async () => {
    const { scrollToLocation, result } = await start({ openKey: "2026-11-01", section: 2 });
    for (let attempt = 0; attempt <= CALENDAR_OPEN_RETRY_LIMIT; attempt += 1) {
      result.current();
      jest.advanceTimersByTime(CALENDAR_OPEN_RETRY_MS);
    }
    expect(scrollToLocation).toHaveBeenCalledTimes(1 + CALENDAR_OPEN_RETRY_LIMIT);
  });

  it("scrolls again on coming back to the month", async () => {
    const { scrollToLocation, rerender } = await start({ openKey: "2026-11-01", section: 2 });
    await rerender({ openKey: null, section: 2 });
    await rerender({ openKey: "2026-11-01", section: 2 });
    expect(scrollToLocation).toHaveBeenCalledTimes(2);
  });

  it("stays at the top when there's nothing to scroll to", async () => {
    const { scrollToLocation } = await start({ openKey: "2026-11-01", section: null });
    expect(scrollToLocation).not.toHaveBeenCalled();
  });
});
