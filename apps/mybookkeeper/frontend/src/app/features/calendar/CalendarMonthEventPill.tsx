import {
  CALENDAR_MONTH_DAY_HEADER_PX,
  CALENDAR_MONTH_LANE_GAP_PX,
  CALENDAR_MONTH_LANE_HEIGHT_PX,
  CALENDAR_WEEK_LENGTH,
  getSourceColor,
  getSourceLabel,
  isReadOnlySource,
} from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import type { MonthEventSegment } from "@/shared/types/calendar/month-event-segment";

export interface CalendarMonthEventPillProps {
  segment: MonthEventSegment;
  onClick: (event: CalendarEvent) => void;
}

/**
 * One booking or tenancy drawn across a week row.
 *
 * Position is expressed in sevenths of the row so the grid stays fluid at any
 * viewport width. A stay that crosses a Saturday is two segments, one per
 * week; the ends that continue into an adjacent week are squared off, so a
 * rounded end always means "this is where the stay actually starts/stops".
 */
export default function CalendarMonthEventPill({
  segment,
  onClick,
}: CalendarMonthEventPillProps) {
  const { event, startCol, span, continuesBefore, continuesAfter, lane } = segment;

  const isManual = event.source === "manual";
  const sourceLabel = getSourceLabel(event.source);
  // A channel booking can only name its channel — iCal carries no guest.
  // A tenancy knows exactly who lives there, which is the point of the row.
  const isTenancy = isReadOnlySource(event.source);
  const pillLabel = isTenancy ? (event.summary ?? sourceLabel) : sourceLabel;
  const kindWord = isTenancy ? "tenancy" : "blackout";

  const roundingClass = [
    continuesBefore ? "rounded-l-none" : "rounded-l",
    continuesAfter ? "rounded-r-none" : "rounded-r",
  ].join(" ");

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={`absolute flex items-center overflow-hidden px-1.5 text-[11px] leading-none text-white shadow-sm transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-primary ${roundingClass}`}
      style={{
        left: `calc(${(startCol / CALENDAR_WEEK_LENGTH) * 100}% + 2px)`,
        width: `calc(${(span / CALENDAR_WEEK_LENGTH) * 100}% - 4px)`,
        top:
          CALENDAR_MONTH_DAY_HEADER_PX +
          lane * (CALENDAR_MONTH_LANE_HEIGHT_PX + CALENDAR_MONTH_LANE_GAP_PX),
        height: CALENDAR_MONTH_LANE_HEIGHT_PX,
        backgroundColor: getSourceColor(event.source),
        backgroundImage: isManual
          ? "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.18) 4px, rgba(255,255,255,0.18) 8px)"
          : undefined,
      }}
      title={`${sourceLabel}\n${event.starts_on} → ${event.ends_on}${event.summary ? `\n${event.summary}` : ""}`}
      aria-label={`${pillLabel} ${kindWord} from ${event.starts_on} to ${event.ends_on}. Click for details.`}
      data-testid="calendar-month-event-pill"
      data-source={event.source}
      data-event-id={event.id}
    >
      <span className="truncate">{pillLabel}</span>
    </button>
  );
}
