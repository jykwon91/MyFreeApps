import {
  CALENDAR_DAY_CELL_PX,
  CALENDAR_LABEL_COLUMN_PX,
} from "@/shared/lib/calendar-constants";
import {
  daysBetween,
  groupByListing,
  groupByProperty,
} from "@/app/features/calendar/calendar-utils";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import CalendarGridHeader from "@/app/features/calendar/CalendarGridHeader";
import CalendarListingRow from "@/app/features/calendar/CalendarListingRow";

interface Props {
  events: readonly CalendarEvent[];
  fromIso: string;
  toIso: string;
}

/**
 * The unified calendar grid (desktop view).
 *
 * Y-axis: listings, grouped by property.
 * X-axis: days in the visible window (`fromIso` inclusive, `toIso` exclusive).
 *
 * Implementation note: built as a custom Tailwind grid rather than
 * FullCalendar because FullCalendar's resource views (the only ones
 * with a Y-axis listings dimension) require a paid commercial
 * license. A custom grid keeps the bundle small, the styling
 * predictable, and lets the skeleton match the loaded layout exactly.
 */
export default function CalendarGrid({ events, fromIso, toIso }: Props) {
  const totalDays = daysBetween(fromIso, toIso);
  const rows = groupByListing(events);
  const groups = groupByProperty(rows);
  const totalGridWidth = CALENDAR_LABEL_COLUMN_PX + totalDays * CALENDAR_DAY_CELL_PX;

  return (
    <div
      className="border rounded-lg overflow-x-auto bg-card"
      data-testid="calendar-grid"
    >
      <div style={{ minWidth: totalGridWidth }}>
        <CalendarGridHeader fromIso={fromIso} totalDays={totalDays} />
        {groups.map((group) => (
          <div key={group.property_id}>
            {/* Property header row — visually distinct so multiple properties
                are obvious without a tree-collapse interaction (kept simple). */}
            <div
              className="flex bg-muted/30 border-t text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-1.5"
              data-testid="calendar-property-header"
            >
              {group.property_name}
            </div>
            {group.rows.map((row) => (
              <CalendarListingRow
                key={row.listing_id}
                row={row}
                fromIso={fromIso}
                toIso={toIso}
                totalDays={totalDays}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
