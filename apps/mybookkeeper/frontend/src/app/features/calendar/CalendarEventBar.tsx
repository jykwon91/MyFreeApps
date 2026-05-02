import { getSourceColor, getSourceLabel } from "@/shared/lib/calendar-constants";
import { CALENDAR_DAY_CELL_PX } from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

interface Props {
  event: CalendarEvent;
  startCol: number;
  span: number;
  onClick: (event: CalendarEvent) => void;
}

/**
 * Single colored bar for one blackout event.
 *
 * Positioned absolutely within the listing row's track. The native
 * `title` attribute serves as the tooltip — we deliberately avoid a
 * custom tooltip library to keep the page bundle small.
 *
 * `manual` source gets a hatched overlay so it visually reads as
 * operator-entered (vs. an iCal import).
 */
export default function CalendarEventBar({ event, startCol, span, onClick }: Props) {
  const isManual = event.source === "manual";
  const color = getSourceColor(event.source);
  const label = getSourceLabel(event.source);

  // Inclusive end date for display ("Jun 5 → Jun 9" not "Jun 5 → Jun 10")
  // because the underlying ends_on is exclusive.
  const displayEndsOn = event.ends_on; // bar shows full span; tooltip shows raw

  const tooltip = [
    label,
    `${event.starts_on} → ${displayEndsOn}`,
    event.summary ? event.summary : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="absolute top-1.5 bottom-1.5 rounded text-xs text-white px-2 flex items-center overflow-hidden cursor-pointer shadow-sm hover:shadow-md hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
      style={{
        left: startCol * CALENDAR_DAY_CELL_PX + 2,
        width: Math.max(0, span * CALENDAR_DAY_CELL_PX - 4),
        backgroundColor: color,
        backgroundImage: isManual
          ? "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.18) 4px, rgba(255,255,255,0.18) 8px)"
          : undefined,
      }}
      title={tooltip}
      aria-label={`${label} blackout from ${event.starts_on} to ${displayEndsOn}. Click for details.`}
      data-testid="calendar-event-bar"
      data-source={event.source}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}
