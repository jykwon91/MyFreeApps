import {
  CALENDAR_UNASSIGNED_LISTING_LABEL,
  getSourceColor,
  getSourceLabel,
  isReadOnlySource,
} from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

export interface CalendarAgendaEventProps {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
}

/**
 * One tappable row in the mobile agenda.
 *
 * The headline answers "who or what is this", the sub-line answers "where and
 * from which source". Those differ by kind: a channel booking carries no
 * guest name over iCal, so its listing is the most identifying thing about
 * it; a tenancy knows exactly who lives there, and the tenant's name is what
 * the host is scanning for.
 *
 * A lease with no listing linked still renders — the tenancy is real whether
 * or not the foreign key has been set — with the missing link named in the
 * sub-line instead of silently blank.
 */
export default function CalendarAgendaEvent({ event, onSelect }: CalendarAgendaEventProps) {
  const sourceLabel = getSourceLabel(event.source);
  const isTenancy = isReadOnlySource(event.source);
  const listingLabel = event.listing_name ?? CALENDAR_UNASSIGNED_LISTING_LABEL;

  const headline = isTenancy ? (event.summary ?? sourceLabel) : listingLabel;
  // A channel's headline is already its listing, so repeating it below would
  // waste the line; a tenancy's headline is the tenant, so the listing goes
  // here. `property_name` is null exactly when `listing_name` is.
  const subLine = [
    isTenancy ? listingLabel : null,
    event.property_name,
    sourceLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="flex items-start gap-2 w-full text-left p-2 -m-2 rounded-md hover:bg-muted transition-colors min-h-[44px]"
      data-testid="calendar-agenda-event"
      aria-label={`${headline}, ${sourceLabel} booking. Click for details.`}
    >
      <span
        className="inline-block h-3 w-3 rounded-sm mt-1 shrink-0"
        style={{ backgroundColor: getSourceColor(event.source) }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{headline}</div>
        <div className="text-xs text-muted-foreground truncate">{subLine}</div>
        <div className="text-xs text-muted-foreground">
          {event.starts_on} → {event.ends_on}
        </div>
      </div>
    </button>
  );
}
