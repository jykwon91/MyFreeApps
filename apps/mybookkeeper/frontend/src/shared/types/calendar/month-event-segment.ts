import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

/**
 * One event clipped to one week row.
 *
 * A stay that crosses a Saturday produces two segments — one per week —
 * so each can be positioned inside its own row. `continuesBefore` /
 * `continuesAfter` tell the pill which ends to leave square, which is how
 * a reader distinguishes "this stay starts Monday" from "this stay was
 * already running when the week began".
 */
export interface MonthEventSegment {
  event: CalendarEvent;
  /** Column index within the week, 0 (Sunday) – 6 (Saturday). */
  startCol: number;
  /** Number of columns covered, 1 – 7. */
  span: number;
  /** The event started before this week's Sunday. */
  continuesBefore: boolean;
  /** The event runs past this week's Saturday. */
  continuesAfter: boolean;
  /** Vertical slot within the week row; 0 is the topmost. */
  lane: number;
}
