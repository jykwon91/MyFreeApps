/**
 * Unit tests for tenant-occupancy events in the calendar detail dialog.
 *
 * A `lease` event's `id` is a lease id, not a blackout id. The notes and
 * attachment endpoints are keyed by blackout, so offering either would fire a
 * request that 404s. These tests pin that the dialog hides both and links to
 * the lease instead — and that channel events are unaffected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
import * as calendarApi from "@/shared/store/calendarApi";
import CalendarEventDetail from "@/app/features/calendar/CalendarEventDetail";
import CalendarEventBar from "@/app/features/calendar/CalendarEventBar";
import {
  CALENDAR_FILTER_SOURCES,
  getSourceColor,
  getSourceLabel,
  isReadOnlySource,
} from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "blackout-1",
    listing_id: "listing-1",
    listing_name: "Master Bedroom",
    property_id: "prop-1",
    property_name: "Med Center House",
    starts_on: "2026-06-05",
    ends_on: "2026-06-10",
    source: "airbnb",
    source_event_id: "uid-1",
    summary: null,
    host_notes: null,
    attachment_count: 0,
    updated_at: "2026-05-01T12:00:00Z",
    ...overrides,
  };
}

function makeLeaseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return makeEvent({
    id: "lease-abc",
    source: "lease",
    source_event_id: null,
    summary: "Sonu King",
    starts_on: "2026-05-03",
    ends_on: "2026-08-10", // exclusive — term runs through Aug 9
    ...overrides,
  });
}

function renderDetail(event: CalendarEvent) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CalendarEventDetail event={event} onClose={vi.fn()} />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
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

describe("lease events in the calendar detail dialog", () => {
  it("shows the tenant name as the title, exactly once", () => {
    renderDetail(makeLeaseEvent());
    // The title already names the tenant — a duplicate summary row would be
    // noise, so the dialog must not also render one.
    expect(screen.getAllByText("Sonu King")).toHaveLength(1);
  });

  it("hides the notes editor — the id is a lease, not a blackout", () => {
    renderDetail(makeLeaseEvent());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("never queries blackout attachments for a lease event", () => {
    renderDetail(makeLeaseEvent());
    // The attachments section is not rendered, so its hook never fires.
    expect(calendarApi.useGetBlackoutAttachmentsQuery).not.toHaveBeenCalled();
  });

  it("links to the lease so the host has somewhere to edit", () => {
    renderDetail(makeLeaseEvent());
    const link = screen.getByRole("link", { name: /open the lease/i });
    expect(link).toHaveAttribute("href", "/leases/lease-abc");
  });

  it("reads as a Tenant source, with no channel row", () => {
    renderDetail(makeLeaseEvent());
    expect(screen.getAllByText("Tenant")).toHaveLength(1);
    expect(screen.queryByText("From channel")).not.toBeInTheDocument();
  });

  it("omits the iCal guest-details hint, which does not apply to leases", () => {
    renderDetail(makeLeaseEvent());
    expect(screen.queryByText(/doesn't expose guest details/i)).not.toBeInTheDocument();
  });

  it("counts a months-long tenancy in days, not nights", () => {
    renderDetail(makeLeaseEvent());
    expect(screen.getByText("Days")).toBeInTheDocument();
    expect(screen.queryByText("Nights")).not.toBeInTheDocument();
  });
});

describe("channel events keep their editing affordances", () => {
  it("still renders the notes editor for an airbnb blackout", () => {
    renderDetail(makeEvent());
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("still queries blackout attachments for an airbnb blackout", () => {
    renderDetail(makeEvent());
    expect(calendarApi.useGetBlackoutAttachmentsQuery).toHaveBeenCalled();
  });

  it("still shows the iCal guest-details hint when no summary is present", () => {
    renderDetail(makeEvent());
    expect(screen.getByText(/doesn't expose guest details/i)).toBeInTheDocument();
  });
});

describe("the bar on the grid", () => {
  function renderBar(event: CalendarEvent) {
    return render(
      <CalendarEventBar event={event} startCol={0} span={5} onClick={vi.fn()} />,
    );
  }

  it("names the tenant rather than repeating the source label", () => {
    renderBar(makeLeaseEvent());
    // "Tenant" on every band would tell the host nothing they didn't
    // already know from the colour — the name is the reason they looked.
    expect(screen.getByRole("button")).toHaveTextContent("Sonu King");
  });

  it("falls back to the source label when the tenancy has no name", () => {
    renderBar(makeLeaseEvent({ summary: null }));
    expect(screen.getByRole("button")).toHaveTextContent("Tenant");
  });

  it("still shows the channel name on a channel bar", () => {
    // iCal sends no guest name, so the channel is all there is to show.
    renderBar(makeEvent());
    expect(screen.getByRole("button")).toHaveTextContent("Airbnb");
  });

  it("calls a tenancy a tenancy, not a blackout, for screen readers", () => {
    renderBar(makeLeaseEvent());
    expect(
      screen.getByRole("button", { name: /Sonu King tenancy from 2026-05-03/i }),
    ).toBeInTheDocument();
  });

  it("still calls a channel booking a blackout", () => {
    renderBar(makeEvent());
    expect(
      screen.getByRole("button", { name: /Airbnb blackout from 2026-06-05/i }),
    ).toBeInTheDocument();
  });
});

describe("lease source registration", () => {
  it("appears in the legend and filter list", () => {
    expect(CALENDAR_FILTER_SOURCES).toContain("lease");
  });

  it("has its own color rather than the unknown-source fallback", () => {
    expect(getSourceColor("lease")).not.toBe(getSourceColor("some-new-channel"));
  });

  it("reads as 'Tenant' in the legend", () => {
    expect(getSourceLabel("lease")).toBe("Tenant");
  });

  it("is the only read-only source today", () => {
    expect(isReadOnlySource("lease")).toBe(true);
    expect(isReadOnlySource("airbnb")).toBe(false);
    expect(isReadOnlySource("manual")).toBe(false);
  });
});
