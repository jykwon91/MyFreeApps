import { CALENDAR_UNASSIGNED_LISTING_LABEL, getSourceLabel, isReadOnlySource } from "@mybookkeeper/api-client/constants/calendarSources";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { CALENDAR_MESSAGES } from "../../constants/calendar";
import { dateFromIso, isoFromDate, shiftMonth } from "../../lib/localDate";
import type { CalendarSection } from "../../types/CalendarSection";

const MS_PER_DAY = 86_400_000;

export function monthTitle(month: string): string {
  return dateFromIso(month).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function monthName(month: string): string {
  return dateFromIso(month).toLocaleDateString(undefined, { month: "long" });
}

function shortDate(iso: string): string {
  return dateFromIso(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayCount(from: string, to: string): number {
  const utcDay = (iso: string) => {
    const date = dateFromIso(iso);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  return Math.round((utcDay(to) - utcDay(from)) / MS_PER_DAY);
}

/** `ends_on` is the day after the last one, which is the check-out day for a booking but past the end of a lease. */
function shownEnd(event: CalendarEvent): string {
  if (!isReadOnlySource(event.source)) return event.ends_on;
  const end = dateFromIso(event.ends_on);
  return isoFromDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1));
}

export function stayLength(event: CalendarEvent): string {
  const count = Math.max(1, dayCount(event.starts_on, event.ends_on));
  if (isReadOnlySource(event.source)) return count === 1 ? "1 day" : `${count} days`;
  return count === 1 ? "1 night" : `${count} nights`;
}

/** `updated_at` is a moment, not a calendar date, so the phone's own time zone is the right one here. */
export function lastChangedLine(event: CalendarEvent): string {
  const label = isReadOnlySource(event.source) ? CALENDAR_MESSAGES.lastUpdated : CALENDAR_MESSAGES.lastSynced;
  return `${label} ${new Date(event.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function stayDates(event: CalendarEvent): string {
  return `${shortDate(event.starts_on)} – ${shortDate(shownEnd(event))}`;
}

/** A booking arrives with no guest name, so its listing says the most. A tenant's name is what a host looks for. */
export function eventHeadline(event: CalendarEvent): string {
  if (isReadOnlySource(event.source)) return event.summary ?? getSourceLabel(event.source);
  return event.listing_name ?? getSourceLabel(event.source);
}

export function eventPlace(event: CalendarEvent): string {
  const source = getSourceLabel(event.source);
  if (!isReadOnlySource(event.source)) return [event.property_name, source].filter(Boolean).join(" · ");
  return [event.listing_name ?? CALENDAR_UNASSIGNED_LISTING_LABEL, event.property_name, source].filter(Boolean).join(" · ");
}

/** Null when the stay ends within this month, or checks out on the first of the next. */
export function continuesInto(event: CalendarEvent, month: string): string | null {
  const nextMonth = shiftMonth(month, 1);
  return event.ends_on > nextMonth ? `continues into ${monthName(nextMonth)}` : null;
}

export function eventSpokenLabel(event: CalendarEvent, month: string): string {
  return [eventHeadline(event), eventPlace(event), stayDates(event), stayLength(event), continuesInto(event, month)]
    .filter(Boolean)
    .join(", ");
}

/** Who's already there comes first, then each check-in date in order. */
export function calendarSections(events: readonly CalendarEvent[], month: string, today: string): CalendarSection[] {
  const sorted = [...events].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const earlier = sorted.filter((event) => event.starts_on < month);
  const sections: CalendarSection[] = [];
  if (earlier.length > 0) {
    const title = `Already here from before ${monthName(month)}`;
    sections.push({ key: "earlier", title, spokenTitle: title, date: null, data: earlier });
  }
  for (const event of sorted) {
    if (event.starts_on < month) continue;
    const last = sections[sections.length - 1];
    if (last?.date === event.starts_on) {
      last.data.push(event);
      continue;
    }
    const date = dateFromIso(event.starts_on);
    const title = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const spoken = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const isToday = event.starts_on === today;
    sections.push({
      key: event.starts_on,
      title: isToday ? `${CALENDAR_MESSAGES.today}, ${shortDate(event.starts_on)}` : title,
      spokenTitle: isToday ? `${CALENDAR_MESSAGES.today}, ${spoken}` : spoken,
      date: event.starts_on,
      data: [event],
    });
  }
  return sections;
}

/** Where to open this month: today's check-ins, or the next ones after today. Null to stay at the top. */
export function sectionToOpenAt(sections: readonly CalendarSection[], today: string): number | null {
  const index = sections.findIndex((section) => section.date !== null && section.date >= today);
  return index > 0 ? index : null;
}

export function bookingCount(count: number): string {
  if (count === 0) return "no bookings";
  return count === 1 ? "1 booking" : `${count} bookings`;
}

export function emptyMonthHeading(month: string): string {
  return `Nothing booked in ${monthName(month)}.`;
}

export function reviewQueueMessage(count: number): string {
  const subject = count === 1 ? "1 booking needs" : `${count} bookings need`;
  return `${subject} your review. I can't show ${count === 1 ? "it" : "them"} on your phone yet.`;
}
