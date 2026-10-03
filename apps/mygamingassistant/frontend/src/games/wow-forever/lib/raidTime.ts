/**
 * Times on the raid web page, in the viewer's own zone and language.
 *
 * `formatDiscordTime` shows a description's Discord timestamp (`<t:unix:style>`) the way Discord does: the absolute
 * styles through `Intl.DateTimeFormat`, `R` as relative time on moment.js's thresholds, which Discord's follow. The
 * rest label the header and the "Updated … ago" line. Each takes the locale and zone as options so tests can pin
 * them; the page leaves them out (the browser's own).
 */
import { TIME_STYLE } from "@/games/wow-forever/data/raidPage";
import { LINK_WARNING_MS } from "@/games/wow-forever/data/raidPlanner";
import type { TimeStyle } from "@/games/wow-forever/types/raid";

export interface TimeOptions {
  /** A BCP 47 language tag; the viewer's when left out. */
  locale?: string;
  /** An IANA time zone; the viewer's when left out. */
  timeZone?: string;
}

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Under this since the last read: "Updated just now". */
const JUST_NOW_MS = 10 * SECOND_MS;

const CLOCK: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const LONG_DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

type AbsoluteStyle = Exclude<TimeStyle, typeof TIME_STYLE.RELATIVE>;

const ABSOLUTE_FORMATS: Readonly<Record<AbsoluteStyle, Intl.DateTimeFormatOptions>> = {
  [TIME_STYLE.SHORT_TIME]: CLOCK,
  [TIME_STYLE.LONG_TIME]: { ...CLOCK, second: "2-digit" },
  [TIME_STYLE.SHORT_DATE]: { year: "numeric", month: "2-digit", day: "2-digit" },
  [TIME_STYLE.LONG_DATE]: LONG_DATE,
  [TIME_STYLE.SHORT_DATE_TIME]: { ...LONG_DATE, ...CLOCK },
  [TIME_STYLE.LONG_DATE_TIME]: { weekday: "long", ...LONG_DATE, ...CLOCK },
};

/** [unit, its length, the span it's used below]: moment.js's thresholds. */
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number, number])[] = [
  ["second", SECOND_MS, 45 * SECOND_MS],
  ["minute", MINUTE_MS, 45 * MINUTE_MS],
  ["hour", HOUR_MS, 22 * HOUR_MS],
  ["day", DAY_MS, 26 * DAY_MS],
  ["month", 30 * DAY_MS, 320 * DAY_MS],
  ["year", 365 * DAY_MS, Number.POSITIVE_INFINITY],
];

/** "in 3 days", "2 hours ago", "now", "tomorrow"; "" for a time that isn't one. */
export function relativeTime(targetMs: number, nowMs: number, options: TimeOptions = {}): string {
  const span = targetMs - nowMs;
  const found = RELATIVE_UNITS.find(([, , below]) => Math.abs(span) < below);
  if (found === undefined) return "";
  const [unit, length] = found;
  // `|| 0`: a -0 reads "now", not "0 seconds ago".
  const value = Math.round(span / length) || 0;
  return new Intl.RelativeTimeFormat(options.locale, { numeric: "auto" }).format(value, unit);
}

/** A Discord timestamp as Discord shows it, in the viewer's zone; the token as typed when it's out of range. */
export function formatDiscordTime(unix: number, style: TimeStyle, nowMs: number, options: TimeOptions = {}): string {
  const date = new Date(unix * SECOND_MS);
  if (Number.isNaN(date.getTime())) return `<t:${unix}:${style}>`;
  if (style === TIME_STYLE.RELATIVE) return relativeTime(date.getTime(), nowMs, options);
  return formatDate(date, ABSOLUTE_FORMATS[style], options);
}

/** A description timestamp's `dateTime`; undefined when it's out of range. */
export function unixIso(unix: number): string | undefined {
  const date = new Date(unix * SECOND_MS);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/** "Fri, Oct 9". */
export function formatRaidDay(iso: string, options: TimeOptions = {}): string {
  return formatIso(iso, { weekday: "short", month: "short", day: "numeric" }, options);
}

/** "8:00 PM CDT" — with the zone, since every raider reads it in their own. */
export function formatRaidClock(iso: string, options: TimeOptions = {}): string {
  return formatIso(iso, { ...CLOCK, timeZoneName: "short" }, options);
}

/** "in 3 days", from an ISO time. */
export function fromNow(iso: string, nowMs: number, options: TimeOptions = {}): string {
  return relativeTime(Date.parse(iso), nowMs, options);
}

/** "Updated just now", "Updated 20 seconds ago". A read landing just after the clock's last tick is "just now". */
export function updatedLabel(fetchedAtMs: number, nowMs: number, options: TimeOptions = {}): string {
  if (nowMs - fetchedAtMs < JUST_NOW_MS) return "Updated just now";
  return `Updated ${relativeTime(fetchedAtMs, nowMs, options)}`;
}

/** "Link expires in 1 h 52 m", "… in 52 m", "… in less than a minute", then "Link expired"; "" for no time. */
export function linkExpiryLabel(expiresAt: string, nowMs: number): string {
  const left = Date.parse(expiresAt) - nowMs;
  if (Number.isNaN(left)) return "";
  if (left <= 0) return "Link expired";
  const minutes = Math.floor(left / MINUTE_MS);
  if (minutes < 1) return "Link expires in less than a minute";
  const hours = Math.floor(minutes / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60} m`);
  return `Link expires in ${parts.join(" ")}`;
}

/** Whether the link stops working within `LINK_WARNING_MS` — or already has. */
export function isLinkExpiring(expiresAt: string, nowMs: number): boolean {
  return Date.parse(expiresAt) - nowMs < LINK_WARNING_MS;
}

function formatIso(iso: string, format: Intl.DateTimeFormatOptions, options: TimeOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(date, format, options);
}

function formatDate(date: Date, format: Intl.DateTimeFormatOptions, options: TimeOptions): string {
  return new Intl.DateTimeFormat(options.locale, { ...format, timeZone: options.timeZone }).format(date);
}
