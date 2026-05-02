import {
  CALENDAR_FILTER_SOURCES,
  getSourceColor,
  getSourceLabel,
} from "@/shared/lib/calendar-constants";

/**
 * Compact legend showing each known source's color.
 *
 * Renders inline with the filter row. The legend is informational —
 * it does NOT filter on click. Use the source dropdown for filtering.
 */
export default function CalendarLegend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
      data-testid="calendar-legend"
      aria-label="Source legend"
    >
      {CALENDAR_FILTER_SOURCES.map((source) => (
        <li key={source} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: getSourceColor(source) }}
            aria-hidden="true"
          />
          <span>{getSourceLabel(source)}</span>
        </li>
      ))}
    </ul>
  );
}
