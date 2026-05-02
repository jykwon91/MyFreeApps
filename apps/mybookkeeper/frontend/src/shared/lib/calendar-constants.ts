import type { CalendarSource } from "@/shared/types/calendar/calendar-source";

/**
 * Fixed grid sizing for the unified calendar grid.
 *
 * Listings render as horizontal rows, days render as vertical columns.
 * Day cells are 44px wide on desktop (matches the project's 44x44 touch
 * target rule for tap behaviour on tablet). Listing label column is
 * wider so the listing name + property name fit without truncation.
 */
export const CALENDAR_DAY_CELL_PX = 44;
export const CALENDAR_ROW_HEIGHT_PX = 56;
export const CALENDAR_LABEL_COLUMN_PX = 200;

/**
 * Default visible window (days) — keep small enough that ~10 listings
 * fit on a 1280px wide viewport without horizontal scroll.
 *
 * Computed: 1280 - 200 (label) ≈ 1080 / 44 = 24.5 days. Round down to 30
 * and accept a small horizontal scroll on smaller desktops; the user
 * can step the window forward/back via prev/next buttons.
 */
export const CALENDAR_DEFAULT_WINDOW_DAYS = 30;

/**
 * Hard cap matches the backend (`MAX_WINDOW_DAYS`).
 */
export const CALENDAR_MAX_WINDOW_DAYS = 365;

/**
 * Window-size presets surfaced in the nav. Lets the host zoom out for
 * planning ("Year") or zoom in for inspection ("Month") without
 * clicking prev/next repeatedly.
 *
 * `days` is the visible window width; the active preset is highlighted.
 * Order matches reading order (narrow → wide).
 */
export const CALENDAR_WINDOW_PRESETS: ReadonlyArray<{ label: string; days: number }> = [
  { label: "Month", days: 30 },
  { label: "3 mo", days: 90 },
  { label: "6 mo", days: 180 },
  { label: "Year", days: 365 },
];

/**
 * Color per source. `manual` is rendered with a hatched overlay (see
 * the grid component) — this map gives its base background.
 *
 * Choices are tuned to be distinguishable on white and dark themes
 * without being knockoffs of any channel's brand exactly. Airbnb
 * coral leans more terracotta; VRBO blue leans more navy.
 */
export const CALENDAR_SOURCE_COLORS: Record<string, string> = {
  airbnb: "#e8615e",          // coral, distinct from Airbnb's #FF5A5F
  vrbo: "#2563eb",            // royal blue
  furnished_finder: "#0d9488", // teal
  rotating_room: "#7c3aed",   // purple
  direct: "#6b7280",          // slate gray
  manual: "#475569",          // darker slate; hatched overlay added in CSS
};

/**
 * Friendly labels for the legend + filter dropdown.
 */
export const CALENDAR_SOURCE_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  furnished_finder: "Furnished Finder",
  rotating_room: "Rotating Room",
  direct: "Direct",
  manual: "Manual",
};

/**
 * Fallback color for unknown source slugs (e.g., a channel added on
 * the backend before the frontend is updated). Slightly lighter than
 * `direct` so it stands out as "I don't know what this is."
 */
export const CALENDAR_UNKNOWN_SOURCE_COLOR = "#94a3b8";

export function getSourceColor(source: string): string {
  return CALENDAR_SOURCE_COLORS[source] ?? CALENDAR_UNKNOWN_SOURCE_COLOR;
}

export function getSourceLabel(source: string): string {
  return CALENDAR_SOURCE_LABELS[source] ?? source;
}

/**
 * Sources we surface in the filter dropdown. Includes every known
 * source even if no events match it today — the dropdown is a planning
 * tool, not a result filter, and stays stable across windows.
 */
export const CALENDAR_FILTER_SOURCES: readonly CalendarSource[] = [
  "airbnb",
  "vrbo",
  "furnished_finder",
  "rotating_room",
  "direct",
  "manual",
];
