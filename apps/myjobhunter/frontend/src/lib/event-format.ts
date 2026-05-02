/**
 * Formatting helpers for application event types.
 *
 * Event types are stored as snake_case strings (e.g. "phone_screen",
 * "interview_scheduled"). This module provides human-readable labels and
 * badge color mappings for rendering in the Applications list and timeline.
 */
import type { BadgeColor } from "@platform/ui/components/ui/Badge";

/** Maps known event_type values to their human-readable display labels. */
const EVENT_TYPE_LABELS: Record<string, string> = {
  applied: "Applied",
  email_received: "Email received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  rejected: "Rejected",
  offer_received: "Offer received",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  note_added: "Note added",
};

/**
 * Convert a snake_case event_type string to a human-readable label.
 *
 * Falls back to capitalizing the first letter of the raw value for unknown
 * event types introduced in future schema versions — never throws, never
 * returns an empty string.
 */
export function formatEventType(eventType: string): string {
  return (
    EVENT_TYPE_LABELS[eventType] ??
    eventType.charAt(0).toUpperCase() + eventType.slice(1).replace(/_/g, " ")
  );
}

/** Maps known event_type values to a Badge color for the status column. */
const EVENT_TYPE_COLORS: Record<string, BadgeColor> = {
  applied: "blue",
  email_received: "blue",
  interview_scheduled: "purple",
  interview_completed: "purple",
  offer_received: "green",
  rejected: "red",
  withdrawn: "gray",
  ghosted: "gray",
  note_added: "gray",
};

/**
 * Return the badge color for a given event_type.
 *
 * Unknown event types (future schema additions) fall back to "gray" so the
 * UI never crashes — they are logged in the PR description as candidates for
 * future color-coding.
 */
export function getEventTypeColor(eventType: string): BadgeColor {
  return EVENT_TYPE_COLORS[eventType] ?? "gray";
}

/**
 * Numeric sort order for client-side sorting of the Status column.
 *
 * Lower numbers sort first (applied → in-process → offer → rejected → null).
 * Unknown event types sort last (before null).
 */
const EVENT_TYPE_SORT_ORDER: Record<string, number> = {
  applied: 0,
  email_received: 1,
  interview_scheduled: 2,
  interview_completed: 3,
  offer_received: 4,
  rejected: 5,
  withdrawn: 6,
  ghosted: 7,
  note_added: 8,
};

/**
 * Return the sort rank for a given event_type string (or null/undefined).
 * Used by the DataTable sort function for the Status column.
 */
export function getEventTypeSortRank(eventType: string | null | undefined): number {
  if (eventType == null) return 999;
  return EVENT_TYPE_SORT_ORDER[eventType] ?? 998;
}
