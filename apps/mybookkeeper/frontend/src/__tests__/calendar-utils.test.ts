import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  daysInMonth,
  eventSpan,
  eventStartIndex,
  firstOfMonth,
  formatMonthYear,
  formatWindowLabel,
  groupByListing,
  groupByProperty,
  lastSyncedAt,
  parseIsoDate,
  relativeTime,
} from "@/app/features/calendar/calendar-utils";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

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
    updated_at: "2026-05-01T12:00:00Z",
    ...overrides,
  };
}

describe("parseIsoDate / formatIsoDate", () => {
  it("parses ISO date as UTC midnight", () => {
    const d = parseIsoDate("2026-06-05");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // June = 5 (zero-indexed)
    expect(d.getUTCDate()).toBe(5);
    expect(d.getUTCHours()).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts days for a 5-day window", () => {
    expect(daysBetween("2026-06-01", "2026-06-06")).toBe(5);
  });

  it("returns zero for same date", () => {
    expect(daysBetween("2026-06-01", "2026-06-01")).toBe(0);
  });

  it("handles month boundaries", () => {
    expect(daysBetween("2026-06-30", "2026-07-02")).toBe(2);
  });

  it("handles a leap-day boundary correctly", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-06-01", 30)).toBe("2026-07-01");
  });

  it("subtracts with negative input", () => {
    expect(addDays("2026-06-30", -29)).toBe("2026-06-01");
  });
});

describe("eventStartIndex", () => {
  it("clamps negative to zero (event starts before window)", () => {
    const event = makeEvent({ starts_on: "2026-05-25", ends_on: "2026-06-05" });
    expect(eventStartIndex(event, "2026-06-01")).toBe(0);
  });

  it("returns the day offset within the window", () => {
    const event = makeEvent({ starts_on: "2026-06-05", ends_on: "2026-06-10" });
    expect(eventStartIndex(event, "2026-06-01")).toBe(4);
  });
});

describe("eventSpan", () => {
  it("returns full span when event is fully inside window", () => {
    const event = makeEvent({ starts_on: "2026-06-05", ends_on: "2026-06-10" });
    expect(eventSpan(event, "2026-06-01", "2026-07-01")).toBe(5);
  });

  it("clips when event starts before window", () => {
    const event = makeEvent({ starts_on: "2026-05-25", ends_on: "2026-06-05" });
    expect(eventSpan(event, "2026-06-01", "2026-07-01")).toBe(4);
  });

  it("clips when event ends after window", () => {
    const event = makeEvent({ starts_on: "2026-06-25", ends_on: "2026-07-10" });
    expect(eventSpan(event, "2026-06-01", "2026-07-01")).toBe(6);
  });

  it("never returns less than 1 (degenerate case)", () => {
    const event = makeEvent({ starts_on: "2026-06-01", ends_on: "2026-06-01" });
    expect(eventSpan(event, "2026-06-01", "2026-07-01")).toBeGreaterThanOrEqual(1);
  });
});

describe("groupByListing", () => {
  it("groups events into one row per listing, sorted by property then listing", () => {
    const events: CalendarEvent[] = [
      makeEvent({ id: "1", listing_id: "L2", listing_name: "Z Room", property_name: "House A" }),
      makeEvent({ id: "2", listing_id: "L1", listing_name: "A Room", property_name: "House A" }),
      makeEvent({ id: "3", listing_id: "L3", listing_name: "B Room", property_name: "House B" }),
      makeEvent({ id: "4", listing_id: "L1", listing_name: "A Room", property_name: "House A" }),
    ];
    const rows = groupByListing(events);
    expect(rows).toHaveLength(3);
    // Sort: House A → A Room, House A → Z Room, House B → B Room.
    expect(rows[0].listing_name).toBe("A Room");
    expect(rows[0].events).toHaveLength(2);
    expect(rows[1].listing_name).toBe("Z Room");
    expect(rows[2].property_name).toBe("House B");
  });

  it("handles empty input", () => {
    expect(groupByListing([])).toEqual([]);
  });
});

describe("groupByProperty", () => {
  it("groups listing rows by property", () => {
    const events: CalendarEvent[] = [
      makeEvent({ id: "1", listing_id: "L1", property_id: "P1", property_name: "A" }),
      makeEvent({ id: "2", listing_id: "L2", property_id: "P1", property_name: "A" }),
      makeEvent({ id: "3", listing_id: "L3", property_id: "P2", property_name: "B" }),
    ];
    const rows = groupByListing(events);
    const groups = groupByProperty(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1].rows).toHaveLength(1);
  });
});

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

describe("relativeTime", () => {
  const now = new Date("2026-05-02T12:00:00Z");

  it('shows "just now" for very recent', () => {
    expect(relativeTime("2026-05-02T11:59:30Z", now)).toBe("just now");
  });

  it("shows minutes for recent", () => {
    expect(relativeTime("2026-05-02T11:30:00Z", now)).toBe("30 minutes ago");
  });

  it("shows hours for same day", () => {
    expect(relativeTime("2026-05-02T08:00:00Z", now)).toBe("4 hours ago");
  });

  it("shows days for week-old", () => {
    expect(relativeTime("2026-04-30T12:00:00Z", now)).toBe("2 days ago");
  });

  it("uses singular form when exactly 1", () => {
    expect(relativeTime("2026-05-02T11:59:00Z", now)).toBe("1 minute ago");
    expect(relativeTime("2026-05-02T11:00:00Z", now)).toBe("1 hour ago");
  });
});

describe("formatMonthYear", () => {
  it("formats UTC ISO date as full month + year", () => {
    expect(formatMonthYear("2026-05-02")).toBe("May 2026");
    expect(formatMonthYear("2026-12-31")).toBe("December 2026");
  });

  it("uses UTC, not local timezone", () => {
    // 2026-01-01 in UTC is January 2026 regardless of local zone.
    expect(formatMonthYear("2026-01-01")).toBe("January 2026");
  });
});

describe("formatWindowLabel", () => {
  it("compact form within same year", () => {
    // ends_on is exclusive — last visible day is May 31.
    expect(formatWindowLabel("2026-05-02", "2026-06-01")).toBe(
      "May 2 – May 31, 2026",
    );
  });

  it("expanded form crossing years", () => {
    expect(formatWindowLabel("2026-12-15", "2027-01-15")).toBe(
      "Dec 15, 2026 – Jan 14, 2027",
    );
  });
});

describe("firstOfMonth", () => {
  it("returns ISO for first of given month at UTC", () => {
    expect(firstOfMonth(2026, 0)).toBe("2026-01-01");
    expect(firstOfMonth(2026, 4)).toBe("2026-05-01");
    expect(firstOfMonth(2026, 11)).toBe("2026-12-01");
  });
});

describe("daysInMonth", () => {
  it("31 for January, May, December", () => {
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(31);
    expect(daysInMonth(2026, 11)).toBe(31);
  });

  it("30 for April, June", () => {
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 5)).toBe(30);
  });

  it("28 for non-leap February, 29 for leap", () => {
    expect(daysInMonth(2026, 1)).toBe(28); // 2026 not divisible by 4
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2000, 1)).toBe(29); // century divisible by 400
    expect(daysInMonth(1900, 1)).toBe(28); // century not divisible by 400
  });
});
