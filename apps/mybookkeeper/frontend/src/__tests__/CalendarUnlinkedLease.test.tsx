/**
 * Unit tests for tenancies the host hasn't linked to a listing.
 *
 * `signed_leases.listing_id` is nullable, so a real tenancy can arrive with no
 * listing and no property. The calendar used to inner-join those away, which
 * meant a lease simply never appeared and nothing said why. These tests pin
 * that every surface renders it — timeline row, mobile agenda, detail dialog —
 * and names the missing link instead of showing a blank.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
import CalendarGrid from "@/app/features/calendar/CalendarGrid";
import CalendarAgendaList from "@/app/features/calendar/CalendarAgendaList";
import CalendarEventDetail from "@/app/features/calendar/CalendarEventDetail";
import {
  CALENDAR_UNASSIGNED_LISTING_LABEL,
  CALENDAR_UNASSIGNED_PROPERTY_LABEL,
} from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

function makeLinkedLease(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "lease-linked",
    listing_id: "listing-1",
    listing_name: "Private suite",
    property_id: "prop-1",
    property_name: "6734 Peerless St",
    starts_on: "2026-08-03",
    ends_on: "2026-08-20",
    source: "lease",
    source_event_id: null,
    summary: "Sonu King",
    host_notes: null,
    attachment_count: 0,
    updated_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

function makeUnlinkedLease(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return makeLinkedLease({
    id: "lease-unlinked",
    listing_id: null,
    listing_name: null,
    property_id: null,
    property_name: null,
    summary: "Mohammed Awamleh",
    ...overrides,
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("timeline grid", () => {
  it("renders a row for a lease with no listing", () => {
    renderWithProviders(
      <CalendarGrid
        events={[makeUnlinkedLease()]}
        fromIso="2026-08-01"
        toIso="2026-09-01"
      />,
    );

    const rows = screen.getAllByTestId("calendar-listing-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("data-unassigned", "true");
    expect(screen.getAllByText(CALENDAR_UNASSIGNED_LISTING_LABEL).length).toBeGreaterThan(0);
  });

  it("keeps the unlinked row separate from a linked one, and last", () => {
    renderWithProviders(
      <CalendarGrid
        events={[makeUnlinkedLease(), makeLinkedLease()]}
        fromIso="2026-08-01"
        toIso="2026-09-01"
      />,
    );

    const rows = screen.getAllByTestId("calendar-listing-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveAttribute("data-unassigned");
    expect(rows[1]).toHaveAttribute("data-unassigned", "true");

    const headers = screen.getAllByTestId("calendar-property-header");
    expect(headers.map((h) => h.textContent)).toEqual([
      "6734 Peerless St",
      CALENDAR_UNASSIGNED_PROPERTY_LABEL,
    ]);
  });

  it("still draws the event bar for an unlinked lease", () => {
    renderWithProviders(
      <CalendarGrid
        events={[makeUnlinkedLease()]}
        fromIso="2026-08-01"
        toIso="2026-09-01"
      />,
    );

    const bars = screen.getAllByTestId("calendar-event-bar");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveTextContent("Mohammed Awamleh");
  });
});

describe("mobile agenda", () => {
  it("leads with the tenant name and names the missing link", () => {
    renderWithProviders(<CalendarAgendaList events={[makeUnlinkedLease()]} />);

    const row = screen.getByTestId("calendar-agenda-event");
    expect(row).toHaveTextContent("Mohammed Awamleh");
    expect(row).toHaveTextContent(CALENDAR_UNASSIGNED_LISTING_LABEL);
  });

  it("still shows a channel booking by its listing", () => {
    const channel = makeLinkedLease({
      id: "blackout-1",
      source: "airbnb",
      summary: null,
      source_event_id: "uid-1",
    });
    renderWithProviders(<CalendarAgendaList events={[channel]} />);

    const row = screen.getByTestId("calendar-agenda-event");
    expect(row).toHaveTextContent("Private suite");
    expect(row).toHaveTextContent("6734 Peerless St");
    expect(row).toHaveTextContent("Airbnb");
  });
});

describe("detail dialog", () => {
  it("names the missing link instead of rendering a bare separator", () => {
    renderWithProviders(
      <CalendarEventDetail event={makeUnlinkedLease()} onClose={() => {}} />,
    );

    expect(screen.getByText(CALENDAR_UNASSIGNED_LISTING_LABEL)).toBeInTheDocument();
    expect(screen.getByText("Mohammed Awamleh")).toBeInTheDocument();
  });

  it("keeps listing · property for a linked lease", () => {
    renderWithProviders(
      <CalendarEventDetail event={makeLinkedLease()} onClose={() => {}} />,
    );

    expect(screen.getByText("Private suite · 6734 Peerless St")).toBeInTheDocument();
  });
});
