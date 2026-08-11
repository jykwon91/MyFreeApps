import { describe, expect, it } from "vitest";
import {
  addMonths,
  assignLanes,
  buildMonthGrid,
  eventsOnDay,
  monthGridWindow,
  startOfMonth,
  startOfWeek,
} from "@/app/features/calendar/month-grid-utils";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

function makeEvent(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id">): CalendarEvent {
  return {
    listing_id: "listing-1",
    listing_name: "Room A",
    property_id: "property-1",
    property_name: "Peerless St",
    starts_on: "2026-09-03",
    ends_on: "2026-09-06",
    source: "airbnb",
    source_event_id: null,
    summary: null,
    host_notes: null,
    attachment_count: 0,
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("startOfMonth", () => {
  it("snaps any day to the first of its month", () => {
    expect(startOfMonth("2026-09-17")).toBe("2026-09-01");
    expect(startOfMonth("2026-09-01")).toBe("2026-09-01");
  });
});

describe("addMonths", () => {
  it("steps forward and back", () => {
    expect(addMonths("2026-09-01", 1)).toBe("2026-10-01");
    expect(addMonths("2026-09-01", -1)).toBe("2026-08-01");
  });

  it("crosses year boundaries", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("clamps to the target month's length instead of overflowing", () => {
    // Naive date math turns Jan 31 + 1 month into March 3 — which would make
    // "next month" skip February entirely.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("startOfWeek", () => {
  it("returns the Sunday on or before the date", () => {
    // 2026-09-01 is a Tuesday.
    expect(startOfWeek("2026-09-01")).toBe("2026-08-30");
    // A Sunday is its own week start.
    expect(startOfWeek("2026-08-30")).toBe("2026-08-30");
    // 2026-09-05 is a Saturday.
    expect(startOfWeek("2026-09-05")).toBe("2026-08-30");
  });
});

describe("monthGridWindow", () => {
  it("spans six whole weeks starting on the Sunday before the 1st", () => {
    const { fromIso, toIso } = monthGridWindow("2026-09-17");
    expect(fromIso).toBe("2026-08-30");
    expect(toIso).toBe("2026-10-11"); // 42 days later, exclusive
  });

  it("is the same window for every day in the month", () => {
    expect(monthGridWindow("2026-09-01")).toEqual(monthGridWindow("2026-09-30"));
  });
});

describe("buildMonthGrid", () => {
  it("lays out six rows of seven days", () => {
    const grid = buildMonthGrid("2026-09-01", [], "2026-09-15");
    expect(grid.weeks).toHaveLength(6);
    for (const week of grid.weeks) {
      expect(week.days).toHaveLength(7);
    }
    expect(grid.monthLabel).toBe("September 2026");
  });

  it("marks the padding days from adjacent months", () => {
    const grid = buildMonthGrid("2026-09-01", [], "2026-09-15");
    const firstWeek = grid.weeks[0];
    // Aug 30, Aug 31 pad the front; Sep 1 onwards belong to the month.
    expect(firstWeek.days[0]).toMatchObject({ iso: "2026-08-30", isInAnchorMonth: false });
    expect(firstWeek.days[1]).toMatchObject({ iso: "2026-08-31", isInAnchorMonth: false });
    expect(firstWeek.days[2]).toMatchObject({
      iso: "2026-09-01",
      isInAnchorMonth: true,
      dayOfMonth: 1,
    });
  });

  it("marks today, and only today", () => {
    const grid = buildMonthGrid("2026-09-01", [], "2026-09-15");
    const flagged = grid.weeks.flatMap((w) => w.days).filter((d) => d.isToday);
    expect(flagged.map((d) => d.iso)).toEqual(["2026-09-15"]);
  });

  it("places an event on the week that contains it", () => {
    const event = makeEvent({ id: "e1", starts_on: "2026-09-07", ends_on: "2026-09-10" });
    const grid = buildMonthGrid("2026-09-01", [event], "2026-09-15");

    const weekWithEvent = grid.weeks.filter((w) => w.segments.length > 0);
    expect(weekWithEvent).toHaveLength(1);
    expect(weekWithEvent[0].startIso).toBe("2026-09-06");
    expect(weekWithEvent[0].segments[0]).toMatchObject({
      startCol: 1, // Monday
      span: 3, // ends_on is exclusive: the 7th, 8th, 9th
      continuesBefore: false,
      continuesAfter: false,
      lane: 0,
    });
  });

  it("splits a stay that crosses a week boundary into two joined segments", () => {
    // Thursday the 3rd through Wednesday the 9th, crossing Saturday the 5th.
    const event = makeEvent({ id: "e1", starts_on: "2026-09-03", ends_on: "2026-09-09" });
    const grid = buildMonthGrid("2026-09-01", [event], "2026-09-15");
    const segments = grid.weeks.flatMap((w) => w.segments);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      startCol: 4, // Thursday
      span: 3, // Thu, Fri, Sat
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(segments[1]).toMatchObject({
      startCol: 0, // Sunday
      span: 3, // Sun, Mon, Tue
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("clips a stay that started before the grid and runs past its end", () => {
    const event = makeEvent({ id: "e1", starts_on: "2026-05-03", ends_on: "2026-11-10" });
    const grid = buildMonthGrid("2026-09-01", [event], "2026-09-15");
    const segments = grid.weeks.flatMap((w) => w.segments);

    expect(segments).toHaveLength(6);
    for (const segment of segments) {
      expect(segment).toMatchObject({ startCol: 0, span: 7, continuesBefore: true, continuesAfter: true });
    }
  });

  it("ignores events entirely outside the grid", () => {
    const event = makeEvent({ id: "e1", starts_on: "2026-11-01", ends_on: "2026-11-05" });
    const grid = buildMonthGrid("2026-09-01", [event], "2026-09-15");
    expect(grid.weeks.flatMap((w) => w.segments)).toHaveLength(0);
  });

  it("stacks overlapping events into separate lanes and reuses a freed lane", () => {
    const events = [
      makeEvent({ id: "a", starts_on: "2026-09-06", ends_on: "2026-09-09" }),
      makeEvent({ id: "b", starts_on: "2026-09-07", ends_on: "2026-09-10" }),
      // Starts after "a" ends, so it can share lane 0.
      makeEvent({ id: "c", starts_on: "2026-09-10", ends_on: "2026-09-12" }),
    ];
    const grid = buildMonthGrid("2026-09-01", events, "2026-09-15");
    const lanes = Object.fromEntries(
      grid.weeks
        .flatMap((w) => w.segments)
        .map((s) => [s.event.id, s.lane]),
    );

    expect(lanes).toEqual({ a: 0, b: 1, c: 0 });
  });
});

describe("assignLanes overflow", () => {
  const week = "2026-09-06";

  function segment(startCol: number, span: number, id: string) {
    return {
      event: makeEvent({ id }),
      startCol,
      span,
      continuesBefore: false,
      continuesAfter: false,
    };
  }

  it("keeps every segment when the budget allows", () => {
    const { placed, overflowByDay, laneCount } = assignLanes(
      [segment(0, 3, "a"), segment(0, 3, "b")],
      week,
      4,
    );
    expect(placed).toHaveLength(2);
    expect(overflowByDay).toEqual({});
    expect(laneCount).toBe(2);
  });

  it("counts the segments past the budget per day instead of dropping them", () => {
    const overlapping = [
      segment(1, 2, "a"),
      segment(1, 2, "b"),
      segment(1, 2, "c"), // the third overlaps both, so it lands in lane 2
    ];
    const { placed, overflowByDay, laneCount } = assignLanes(overlapping, week, 2);

    expect(placed.map((s) => s.event.id)).toEqual(["a", "b"]);
    expect(laneCount).toBe(2);
    // "c" covers Monday the 7th and Tuesday the 8th.
    expect(overflowByDay).toEqual({ "2026-09-07": 1, "2026-09-08": 1 });
  });
});

describe("eventsOnDay", () => {
  const events = [
    makeEvent({ id: "a", starts_on: "2026-09-03", ends_on: "2026-09-06" }),
    makeEvent({ id: "b", starts_on: "2026-09-05", ends_on: "2026-09-08" }),
    makeEvent({ id: "c", starts_on: "2026-09-10", ends_on: "2026-09-12" }),
  ];

  it("returns the events covering the day", () => {
    expect(eventsOnDay(events, "2026-09-05").map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("treats ends_on as exclusive", () => {
    // "a" ends_on the 6th, so the 6th is already free.
    expect(eventsOnDay(events, "2026-09-06").map((e) => e.id)).toEqual(["b"]);
  });

  it("returns nothing on an empty day", () => {
    expect(eventsOnDay(events, "2026-09-09")).toEqual([]);
  });
});
