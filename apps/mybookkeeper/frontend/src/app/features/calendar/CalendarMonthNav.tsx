import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, startOfMonth } from "@/app/features/calendar/month-grid-utils";
import MonthYearJumper from "@/app/features/calendar/MonthYearJumper";

export interface CalendarMonthNavProps {
  /** Any date inside the displayed month. */
  anchorIso: string;
  onChange: (anchorIso: string) => void;
  onToday: () => void;
}

/**
 * Period navigation for the month view: `[<] [Month YYYY ▾] [>] [Today]`.
 *
 * The timeline's nav steps by an arbitrary window length and offers window-
 * size presets; neither idea applies here, where the unit is exactly one
 * month. The month/year jumper is shared between the two.
 */
export default function CalendarMonthNav({
  anchorIso,
  onChange,
  onToday,
}: CalendarMonthNavProps) {
  // Anchor on the 1st so stepping from the 31st can't skip a short month.
  const monthStartIso = startOfMonth(anchorIso);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="calendar-month-nav">
      <button
        type="button"
        onClick={() => onChange(addMonths(monthStartIso, -1))}
        title="Previous month"
        className="flex h-9 w-9 items-center justify-center rounded-md border transition-colors hover:bg-muted"
        aria-label="Previous month"
        data-testid="calendar-month-prev"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <MonthYearJumper fromIso={monthStartIso} onJump={onChange} />

      <button
        type="button"
        onClick={() => onChange(addMonths(monthStartIso, 1))}
        title="Next month"
        className="flex h-9 w-9 items-center justify-center rounded-md border transition-colors hover:bg-muted"
        aria-label="Next month"
        data-testid="calendar-month-next"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onToday}
        title="Jump back to this month"
        className="ml-2 h-9 rounded-md border px-3 text-sm transition-colors hover:bg-muted"
        data-testid="calendar-month-today"
      >
        Today
      </button>
    </div>
  );
}
