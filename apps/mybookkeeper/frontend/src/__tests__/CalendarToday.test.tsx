import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import Calendar from "@/app/pages/Calendar";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";

/**
 * "Today" on the calendar is the host's own date. In a US evening UTC is
 * already on the next day, so going through UTC would highlight tomorrow and,
 * on the last evening of a month, open the next month.
 */

// The grid only renders when the window has something in it.
const booking: CalendarEvent = {
  id: "ev-1",
  listing_id: "L1",
  listing_name: "Master Bedroom",
  property_id: "P1",
  property_name: "Med Center House",
  starts_on: "2026-11-10",
  ends_on: "2026-11-12",
  source: "airbnb",
  source_event_id: "uid-1",
  summary: null,
  host_notes: null,
  attachment_count: 0,
  updated_at: "2026-11-01T12:00:00Z",
};

vi.mock("@mybookkeeper/api-client/store/calendarApi", () => ({
  useGetCalendarEventsQuery: vi.fn(() => ({ data: [booking], isFetching: false, error: undefined, refetch: vi.fn() })),
  useGetReviewQueueCountQuery: vi.fn(() => ({ data: 0 })),
  useGetReviewQueueQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  useResolveQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useIgnoreQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDismissQueueItemMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@mybookkeeper/api-client/store/listingsApi", () => ({
  useGetListingsQuery: vi.fn(() => ({ data: { items: [], total: 1, has_more: false }, isLoading: false })),
}));

import { useGetCalendarEventsQuery } from "@mybookkeeper/api-client/store/calendarApi";

// 8pm on Nov 14 in Chicago is 2am on Nov 15 in UTC.
const NOV_14_EVENING = new Date("2026-11-15T02:00:00Z");
// 9:30pm on Nov 30 in Chicago is 3:30am on Dec 1 in UTC.
const NOV_30_EVENING = new Date("2026-12-01T03:30:00Z");
// 9pm on Dec 31 in Chicago is already 2027 in UTC.
const NEW_YEARS_EVE = new Date("2027-01-01T03:00:00Z");

function renderCalendar(url: string) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Calendar />
      </MemoryRouter>
    </Provider>,
  );
}

function highlightedDay(): string | null {
  const cells = screen.getAllByTestId("calendar-month-day").filter((c) => c.getAttribute("data-today") === "true");
  expect(cells).toHaveLength(1);
  return cells[0].getAttribute("data-day");
}

function lastQueriedFrom(): string {
  const calls = vi.mocked(useGetCalendarEventsQuery).mock.calls;
  const args = calls[calls.length - 1][0] as { from: string };
  return args.from;
}

describe("Calendar today, on a US evening", () => {
  beforeEach(() => {
    vi.stubEnv("TZ", "America/Chicago");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(useGetCalendarEventsQuery).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("highlights the host's today, not tomorrow", () => {
    vi.setSystemTime(NOV_14_EVENING);
    renderCalendar("/calendar");
    expect(highlightedDay()).toBe("2026-11-14");
  });

  it("opens on the current month on its last evening", () => {
    vi.setSystemTime(NOV_30_EVENING);
    renderCalendar("/calendar");
    expect(screen.getByTestId("calendar-month-jumper")).toHaveTextContent("November 2026");
    expect(highlightedDay()).toBe("2026-11-30");
  });

  it("Today in the month view goes back to this month", () => {
    vi.setSystemTime(NOV_30_EVENING);
    renderCalendar("/calendar?from=2026-06-01");
    expect(screen.getByTestId("calendar-month-jumper")).toHaveTextContent("June 2026");

    fireEvent.click(screen.getByTestId("calendar-month-today"));

    expect(screen.getByTestId("calendar-month-jumper")).toHaveTextContent("November 2026");
    expect(highlightedDay()).toBe("2026-11-30");
  });

  it("Jump to today in the timeline starts the window on the host's today", () => {
    vi.setSystemTime(NOV_14_EVENING);
    renderCalendar("/calendar?from=2026-06-01&to=2026-07-01&view=timeline");

    fireEvent.click(screen.getByTestId("calendar-today"));

    expect(lastQueriedFrom()).toBe("2026-11-14");
  });

  it("offers years around the host's year, not UTC's", () => {
    vi.setSystemTime(NEW_YEARS_EVE);
    renderCalendar("/calendar");

    fireEvent.click(screen.getByTestId("calendar-month-jumper"));

    const years = Array.from(
      screen.getByTestId("calendar-month-jumper-year").querySelectorAll("option"),
      (o) => o.textContent,
    );
    expect(years[0]).toBe("2024");
    expect(years[years.length - 1]).toBe("2031");
  });
});
