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
 * `title` attribute serves as the tooltip.
 *
 * `manual` source gets a hatched overlay so it visually reads as
 * operator-entered (vs. an iCal import).
 *
 * Top-right corner shows tiny indicators when the host has added notes
 * (📝) or file attachments (📎). Clicking still opens the detail dialog.
 */
export default function CalendarEventBar({ event, startCol, span, onClick }: Props) {
  const isManual = event.source === "manual";
  const color = getSourceColor(event.source);
  const label = getSourceLabel(event.source);

  const hasNotes = event.host_notes != null;
  const hasAttachments = event.attachment_count > 0;

  const tooltip = [
    label,
    `${event.starts_on} → ${event.ends_on}`,
    event.summary ? event.summary : null,
    hasNotes ? "Has notes" : null,
    hasAttachments ? `${event.attachment_count} attachment${event.attachment_count !== 1 ? "s" : ""}` : null,
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
      aria-label={`${label} blackout from ${event.starts_on} to ${event.ends_on}. Click for details.`}
      data-testid="calendar-event-bar"
      data-source={event.source}
    >
      <span className="truncate flex-1">{label}</span>

      {/* Notes / attachment indicators — top-right of the bar */}
      {(hasNotes || hasAttachments) ? (
        <span
          className="absolute top-0.5 right-1 flex gap-0.5 text-[10px] leading-none opacity-90"
          aria-hidden="true"
          data-testid="event-bar-indicators"
        >
          {hasNotes ? <span title="Has notes">📝</span> : null}
          {hasAttachments ? <span title={`${event.attachment_count} attachment(s)`}>📎</span> : null}
        </span>
      ) : null}
    </button>
  );
}
