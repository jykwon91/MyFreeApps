import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  daysBetween,
} from "@/app/features/calendar/calendar-utils";
import MonthYearJumper from "@/app/features/calendar/MonthYearJumper";
import { CALENDAR_WINDOW_PRESETS } from "@/shared/lib/calendar-constants";

interface Props {
  fromIso: string;
  toIso: string;
  onChange: (fromIso: string, toIso: string) => void;
  onToday: () => void;
}

/**
 * Calendar period navigation.
 *
 * Layout (left → right):
 *   [<]  [Month YYYY ▾]  [>]   |   [Month][3 mo][6 mo][Year]   |   [Jump to today]
 *
 * - Prev / Next step by the current visible window length so the user
 *   can move at the same zoom level. Tooltips communicate the step size
 *   ("Previous 30 days" / "Next 90 days").
 * - The month label is a clickable popover (`MonthYearJumper`) — picking
 *   a different month/year jumps `from` to the first of that month and
 *   preserves the current window length.
 * - Window-size presets let the operator zoom out (Year) for planning
 *   or zoom in (Month) for inspection without clicking prev/next many
 *   times. Active preset is highlighted via `aria-pressed`.
 * - "Jump to today" returns `from` to today's date and preserves the
 *   current window length.
 */
export default function CalendarWindowNav({
  fromIso,
  toIso,
  onChange,
  onToday,
}: Props) {
  const stepDays = daysBetween(fromIso, toIso);

  function handlePrev() {
    onChange(addDays(fromIso, -stepDays), addDays(toIso, -stepDays));
  }

  function handleNext() {
    onChange(addDays(fromIso, stepDays), addDays(toIso, stepDays));
  }

  function handleJump(newFromIso: string) {
    onChange(newFromIso, addDays(newFromIso, stepDays));
  }

  function handlePreset(days: number) {
    onChange(fromIso, addDays(fromIso, days));
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="calendar-window-nav"
    >
      <button
        type="button"
        onClick={handlePrev}
        title={`Previous ${stepDays} days`}
        className="h-9 w-9 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"
        aria-label={`Previous ${stepDays} days`}
        data-testid="calendar-prev"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <MonthYearJumper fromIso={fromIso} onJump={handleJump} />

      <button
        type="button"
        onClick={handleNext}
        title={`Next ${stepDays} days`}
        className="h-9 w-9 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"
        aria-label={`Next ${stepDays} days`}
        data-testid="calendar-next"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>

      <div
        className="flex items-center gap-1 ml-2 pl-2 border-l"
        role="group"
        aria-label="Window size"
        data-testid="calendar-window-presets"
      >
        {CALENDAR_WINDOW_PRESETS.map(({ label, days }) => {
          const active = stepDays === days;
          return (
            <button
              key={days}
              type="button"
              onClick={() => handlePreset(days)}
              className={
                active
                  ? "h-9 px-2.5 text-xs rounded-md bg-primary text-primary-foreground transition-colors"
                  : "h-9 px-2.5 text-xs border rounded-md hover:bg-muted transition-colors"
              }
              aria-pressed={active}
              data-testid={`calendar-window-preset-${days}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToday}
        title="Jump back to today's date"
        className="h-9 px-3 ml-2 border rounded-md text-sm hover:bg-muted transition-colors"
        data-testid="calendar-today"
      >
        Jump to today
      </button>
    </div>
  );
}
