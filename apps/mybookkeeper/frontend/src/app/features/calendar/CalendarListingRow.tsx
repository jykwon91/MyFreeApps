import {
  CALENDAR_DAY_CELL_PX,
  CALENDAR_LABEL_COLUMN_PX,
  CALENDAR_ROW_HEIGHT_PX,
} from "@/shared/lib/calendar-constants";
import {
  eventStartIndex,
  eventSpan,
  type ListingRow,
} from "@/app/features/calendar/calendar-utils";
import CalendarEventBar from "@/app/features/calendar/CalendarEventBar";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";

interface Props {
  row: ListingRow;
  fromIso: string;
  toIso: string;
  totalDays: number;
  onEventClick: (event: CalendarEvent) => void;
}

/**
 * One horizontal track per listing — listing label on the left, day
 * cells across, event bars positioned absolutely over the track.
 *
 * Property name is rendered as a small subtitle under the listing name
 * so the operator can disambiguate two rooms named the same way under
 * different properties without an explicit column.
 */
export default function CalendarListingRow({
  row,
  fromIso,
  toIso,
  totalDays,
  onEventClick,
}: Props) {
  return (
    <div
      className="flex border-t"
      style={{ height: CALENDAR_ROW_HEIGHT_PX }}
      data-testid="calendar-listing-row"
      data-listing-id={row.listing_id}
    >
      <div
        className="px-3 py-2 border-r flex flex-col justify-center bg-card"
        style={{ width: CALENDAR_LABEL_COLUMN_PX }}
      >
        <div className="text-sm font-medium truncate" title={row.listing_name}>
          {row.listing_name}
        </div>
        <div
          className="text-xs text-muted-foreground truncate"
          title={row.property_name}
        >
          {row.property_name}
        </div>
      </div>
      <div
        className="relative flex"
        style={{ width: totalDays * CALENDAR_DAY_CELL_PX }}
      >
        {Array.from({ length: totalDays }, (_, i) => (
          <div
            key={i}
            className="border-r"
            style={{ width: CALENDAR_DAY_CELL_PX }}
          />
        ))}
        {row.events.map((event) => {
          const startCol = eventStartIndex(event, fromIso);
          const span = eventSpan(event, fromIso, toIso);
          return (
            <CalendarEventBar
              key={event.id}
              event={event}
              startCol={startCol}
              span={span}
              onClick={onEventClick}
            />
          );
        })}
      </div>
    </div>
  );
}
