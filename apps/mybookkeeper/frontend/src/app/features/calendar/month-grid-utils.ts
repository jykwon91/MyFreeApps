import {
  CALENDAR_MONTH_MAX_LANES,
  CALENDAR_MONTH_WEEKS,
  CALENDAR_WEEK_LENGTH,
} from "@/shared/lib/calendar-constants";
import {
  addDays,
  daysBetween,
  formatIsoDate,
  formatMonthYear,
  parseIsoDate,
} from "@/app/features/calendar/calendar-utils";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import type { MonthEventSegment } from "@/shared/types/calendar/month-event-segment";
import type { MonthGrid } from "@/shared/types/calendar/month-grid";
import type { MonthGridDay } from "@/shared/types/calendar/month-grid-day";
import type { MonthGridWeek } from "@/shared/types/calendar/month-grid-week";

/**
 * Pure helpers for the month view.
 *
 * Same string-first, UTC-anchored discipline as `calendar-utils`: dates are
 * ISO `YYYY-MM-DD` and comparisons are lexicographic, which is exact for that
 * format and immune to the timezone drift that bites date-only `Date` parsing.
 *
 * Event windows follow the API's half-open convention — `starts_on` is
 * inclusive, `ends_on` is exclusive — so a day D is covered when
 * `starts_on <= D < ends_on`.
 */

/** ISO date of the first day of the month containing `iso`. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Shift an ISO date by whole months, clamping to the target month's length. */
export function addMonths(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return formatIsoDate(target);
}

/** The Sunday on or before `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -parseIsoDate(iso).getUTCDay());
}

/**
 * The fetch window backing the month view: the grid's first cell through one
 * day past its last.
 *
 * The grid is always `CALENDAR_MONTH_WEEKS` rows tall. A variable row count
 * would make the page jump by a whole row between months, and would leave the
 * skeleton unable to mirror the loaded layout.
 */
export function monthGridWindow(anchorIso: string): { fromIso: string; toIso: string } {
  const fromIso = startOfWeek(startOfMonth(anchorIso));
  return {
    fromIso,
    toIso: addDays(fromIso, CALENDAR_MONTH_WEEKS * CALENDAR_WEEK_LENGTH),
  };
}

/** Whether an event covers any day in the half-open range `[fromIso, toIso)`. */
function overlapsWindow(event: CalendarEvent, fromIso: string, toIso: string): boolean {
  return event.starts_on < toIso && event.ends_on > fromIso;
}

/**
 * Order segments so the layout is stable and reads top-down by start date.
 *
 * Longer stays sort above shorter ones that start the same day: a bar that
 * runs the width of the week makes a better anchor line than one that stops
 * on Tuesday, and keeping it in a low lane avoids a ragged first row.
 */
function compareForLanes(a: CalendarEvent, b: CalendarEvent): number {
  if (a.starts_on !== b.starts_on) return a.starts_on < b.starts_on ? -1 : 1;
  const aDays = daysBetween(a.starts_on, a.ends_on);
  const bDays = daysBetween(b.starts_on, b.ends_on);
  if (aDays !== bDays) return bDays - aDays;
  return a.id < b.id ? -1 : 1;
}

function clipToWeek(
  event: CalendarEvent,
  weekStartIso: string,
  weekEndIso: string,
): Omit<MonthEventSegment, "lane"> | null {
  const startIso = event.starts_on < weekStartIso ? weekStartIso : event.starts_on;
  const endIso = event.ends_on > weekEndIso ? weekEndIso : event.ends_on;
  const span = daysBetween(startIso, endIso);
  if (span <= 0) return null;
  return {
    event,
    startCol: daysBetween(weekStartIso, startIso),
    span,
    continuesBefore: event.starts_on < weekStartIso,
    continuesAfter: event.ends_on > weekEndIso,
  };
}

/**
 * Pack one week's segments into horizontal lanes.
 *
 * Classic interval partitioning: walk the segments in order and drop each into
 * the first lane whose last segment has already ended. Segments beyond
 * `maxLanes` are not drawn — they are counted per day instead, so the cell can
 * offer a "+N more" affordance rather than silently losing a booking.
 */
export function assignLanes(
  segments: readonly Omit<MonthEventSegment, "lane">[],
  weekStartIso: string,
  maxLanes: number = CALENDAR_MONTH_MAX_LANES,
): { placed: MonthEventSegment[]; overflowByDay: Record<string, number>; laneCount: number } {
  const laneNextFreeCol: number[] = [];
  const placed: MonthEventSegment[] = [];
  const overflowByDay: Record<string, number> = {};

  for (const segment of segments) {
    let lane = laneNextFreeCol.findIndex((nextFree) => nextFree <= segment.startCol);
    if (lane === -1) {
      lane = laneNextFreeCol.length;
      laneNextFreeCol.push(0);
    }
    laneNextFreeCol[lane] = segment.startCol + segment.span;

    if (lane < maxLanes) {
      placed.push({ ...segment, lane });
      continue;
    }

    // Past the budget: give the day cells a count to surface instead.
    for (let i = 0; i < segment.span; i += 1) {
      const iso = addDays(weekStartIso, segment.startCol + i);
      overflowByDay[iso] = (overflowByDay[iso] ?? 0) + 1;
    }
  }

  return {
    placed,
    overflowByDay,
    laneCount: Math.min(laneNextFreeCol.length, maxLanes),
  };
}

function buildDay(iso: string, anchorMonth: string, todayIso: string): MonthGridDay {
  return {
    iso,
    dayOfMonth: parseIsoDate(iso).getUTCDate(),
    isInAnchorMonth: iso.slice(0, 7) === anchorMonth,
    isToday: iso === todayIso,
  };
}

function buildWeek(
  weekStartIso: string,
  events: readonly CalendarEvent[],
  anchorMonth: string,
  todayIso: string,
  maxLanes: number,
): MonthGridWeek {
  const weekEndIso = addDays(weekStartIso, CALENDAR_WEEK_LENGTH);

  const clipped = events
    .filter((event) => overlapsWindow(event, weekStartIso, weekEndIso))
    .sort(compareForLanes)
    .map((event) => clipToWeek(event, weekStartIso, weekEndIso))
    .filter((segment): segment is Omit<MonthEventSegment, "lane"> => segment !== null);

  const { placed, overflowByDay, laneCount } = assignLanes(clipped, weekStartIso, maxLanes);

  return {
    startIso: weekStartIso,
    days: Array.from({ length: CALENDAR_WEEK_LENGTH }, (_, i) =>
      buildDay(addDays(weekStartIso, i), anchorMonth, todayIso),
    ),
    segments: placed,
    overflowByDay,
    laneCount,
  };
}

/**
 * Lay out the month containing `anchorIso`.
 *
 * `events` may span more than the grid — anything outside is filtered per
 * week, so passing the whole fetched window is fine.
 */
export function buildMonthGrid(
  anchorIso: string,
  events: readonly CalendarEvent[],
  todayIso: string,
  maxLanes: number = CALENDAR_MONTH_MAX_LANES,
): MonthGrid {
  const { fromIso, toIso } = monthGridWindow(anchorIso);
  const anchorMonth = anchorIso.slice(0, 7);

  return {
    gridStartIso: fromIso,
    gridEndIso: toIso,
    monthLabel: formatMonthYear(startOfMonth(anchorIso)),
    weeks: Array.from({ length: CALENDAR_MONTH_WEEKS }, (_, i) =>
      buildWeek(
        addDays(fromIso, i * CALENDAR_WEEK_LENGTH),
        events,
        anchorMonth,
        todayIso,
        maxLanes,
      ),
    ),
  };
}

/** Events covering `dayIso`, ordered the same way the grid lays them out. */
export function eventsOnDay(
  events: readonly CalendarEvent[],
  dayIso: string,
): CalendarEvent[] {
  return events
    .filter((event) => event.starts_on <= dayIso && event.ends_on > dayIso)
    .sort(compareForLanes);
}
