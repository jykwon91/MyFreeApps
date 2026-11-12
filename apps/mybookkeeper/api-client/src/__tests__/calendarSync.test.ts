import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../types/calendar/calendar-event";
import { lastSyncedAt } from "../utils/calendarSync";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    listing_id: "l-1",
    listing_name: "Master Bedroom",
    property_id: "p-1",
    property_name: "Med House",
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

describe("lastSyncedAt", () => {
  it("returns the latest updated_at across events", () => {
    const events = [
      makeEvent({ id: "1", updated_at: "2026-04-01T00:00:00Z" }),
      makeEvent({ id: "2", updated_at: "2026-05-15T12:30:00Z" }),
      makeEvent({ id: "3", updated_at: "2026-04-20T10:00:00Z" }),
    ];
    expect(lastSyncedAt(events)).toBe("2026-05-15T12:30:00Z");
  });

  it("returns null when there are no events", () => {
    expect(lastSyncedAt([])).toBeNull();
  });
});
