/**
 * Unit tests for the month view.
 *
 * The month grid is the calendar's default shape, so these cover the things a
 * host reads off it at a glance: the right days in the right columns, a stay
 * drawn as one bar across the days it covers, and — the part that's easy to
 * get wrong — nothing silently hidden when a day is busier than the row has
 * lanes for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
import * as calendarApi from "@/shared/store/calendarApi";
import CalendarMonthGrid from "@/app/features/calendar/CalendarMonthGrid";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

const TODAY = "2026-09-15";
const ANCHOR = "2026-09-01";

function makeEvent(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id">): CalendarEvent {
  return {
    listing_id: "listing-1",
    listing_name: "Master Bedroom",
    property_id: "prop-1",
    property_name: "Med Center House",
    starts_on: "2026-09-07",
    ends_on: "2026-09-10",
    source: "airbnb",
    source_event_id: "uid-1",
    summary: null,
    host_notes: null,
    attachment_count: 0,
    updated_at: "2026-09-01T12:00:00Z",
    ...overrides,
  };
}

function renderMonth(events: CalendarEvent[], anchorIso = ANCHOR) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CalendarMonthGrid events={events} anchorIso={anchorIso} todayIso={TODAY} />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  // The detail dialog reaches for attachments as soon as it opens.
  vi.spyOn(calendarApi, "useGetBlackoutAttachmentsQuery").mockReturnValue({
    data: [],
    isLoading: false,
  } as unknown as ReturnType<typeof calendarApi.useGetBlackoutAttachmentsQuery>);
  vi.spyOn(calendarApi, "useUpdateBlackoutMutation").mockReturnValue([
    vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) }),
    { isLoading: false },
  ] as unknown as ReturnType<typeof calendarApi.useUpdateBlackoutMutation>);
  vi.spyOn(calendarApi, "useUploadBlackoutAttachmentMutation").mockReturnValue([
    vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) }),
    { isLoading: false },
  ] as unknown as ReturnType<typeof calendarApi.useUploadBlackoutAttachmentMutation>);
  vi.spyOn(calendarApi, "useDeleteBlackoutAttachmentMutation").mockReturnValue([
    vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue(undefined) }),
    { isLoading: false },
  ] as unknown as ReturnType<typeof calendarApi.useDeleteBlackoutAttachmentMutation>);
});

describe("CalendarMonthGrid layout", () => {
  it("renders a Sunday-first weekday header", () => {
    renderMonth([]);
    const header = screen.getByTestId("calendar-month-weekday-header");
    expect(header.textContent).toBe("SunMonTueWedThuFriSat");
  });

  it("renders six week rows of seven days", () => {
    renderMonth([]);
    expect(screen.getAllByTestId("calendar-month-week")).toHaveLength(6);
    expect(screen.getAllByTestId("calendar-month-day")).toHaveLength(42);
  });

  it("dims the padding days borrowed from the neighbouring months", () => {
    renderMonth([]);
    // September 2026 starts on a Tuesday, so Aug 30 and 31 pad the front.
    const days = screen.getAllByTestId("calendar-month-day");
    expect(days[0]).toHaveAttribute("data-day", "2026-08-30");
    expect(days[0]).toHaveAttribute("data-outside-month", "true");
    expect(days[2]).toHaveAttribute("data-day", "2026-09-01");
    expect(days[2]).not.toHaveAttribute("data-outside-month");
  });

  it("marks today", () => {
    renderMonth([]);
    const todayCells = screen
      .getAllByTestId("calendar-month-day")
      .filter((cell) => cell.getAttribute("data-today") === "true");
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]).toHaveAttribute("data-day", TODAY);
  });
});

describe("CalendarMonthGrid events", () => {
  it("draws a stay as a single pill labelled by source", () => {
    renderMonth([makeEvent({ id: "e1" })]);
    const pills = screen.getAllByTestId("calendar-month-event-pill");
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveTextContent("Airbnb");
    expect(pills[0]).toHaveAttribute("data-source", "airbnb");
  });

  it("names the tenant on a lease pill instead of the source", () => {
    renderMonth([
      makeEvent({ id: "e1", source: "lease", summary: "Mohammed Awamleh" }),
    ]);
    expect(screen.getByTestId("calendar-month-event-pill")).toHaveTextContent(
      "Mohammed Awamleh",
    );
  });

  it("splits a stay that crosses a week boundary into two joined pills", () => {
    // Thursday the 3rd → Wednesday the 9th, crossing Saturday the 5th.
    renderMonth([makeEvent({ id: "e1", starts_on: "2026-09-03", ends_on: "2026-09-09" })]);
    const pills = screen.getAllByTestId("calendar-month-event-pill");
    expect(pills).toHaveLength(2);
    // Both halves still describe the whole stay to a screen reader.
    for (const pill of pills) {
      expect(pill).toHaveAttribute(
        "aria-label",
        expect.stringContaining("from 2026-09-03 to 2026-09-09"),
      );
    }
  });

  it("opens the detail dialog when a pill is clicked", () => {
    renderMonth([makeEvent({ id: "e1" })]);
    fireEvent.click(screen.getByTestId("calendar-month-event-pill"));
    expect(screen.getByTestId("calendar-event-detail")).toBeInTheDocument();
  });
});

describe("CalendarMonthGrid overflow", () => {
  // Five stays over the same days — one more than the lane budget.
  const crowded = Array.from({ length: 5 }, (_, i) =>
    makeEvent({ id: `e${i}`, starts_on: "2026-09-07", ends_on: "2026-09-09" }),
  );

  it("offers a +N more affordance rather than dropping the extra stay", () => {
    renderMonth(crowded);
    expect(screen.getAllByTestId("calendar-month-event-pill")).toHaveLength(4);
    const overflow = screen.getAllByTestId("calendar-month-overflow");
    // The hidden stay covers the 7th and the 8th.
    expect(overflow).toHaveLength(2);
    expect(overflow[0]).toHaveTextContent("+1 more");
  });

  it("lists every stay on the day — not just the hidden ones — when opened", () => {
    renderMonth(crowded);
    fireEvent.click(screen.getAllByTestId("calendar-month-overflow")[0]);

    const dialog = screen.getByTestId("calendar-month-day-dialog");
    expect(within(dialog).getAllByTestId("calendar-month-day-dialog-event")).toHaveLength(5);
    expect(dialog).toHaveTextContent("Monday, September 7, 2026");
    expect(dialog).toHaveTextContent("5 bookings");
  });

  it("swaps the day list for the detail dialog when a listed stay is clicked", () => {
    renderMonth(crowded);
    fireEvent.click(screen.getAllByTestId("calendar-month-overflow")[0]);
    fireEvent.click(screen.getAllByTestId("calendar-month-day-dialog-event")[0]);

    expect(screen.queryByTestId("calendar-month-day-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("calendar-event-detail")).toBeInTheDocument();
  });
});
