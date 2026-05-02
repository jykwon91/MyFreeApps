import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, daysBetween } from "@/app/features/calendar/calendar-utils";

interface Props {
  fromIso: string;
  toIso: string;
  onChange: (fromIso: string, toIso: string) => void;
  onToday: () => void;
}

/**
 * Date-range navigation: prev / today / next.
 *
 * Step size = current window length. So if the user is viewing 30
 * days, "next" advances 30 days. This keeps the visible context size
 * consistent as the user moves through the calendar.
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

  return (
    <div className="flex items-center gap-1" data-testid="calendar-window-nav">
      <button
        type="button"
        onClick={handlePrev}
        className="h-9 w-9 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"
        aria-label="Previous window"
        data-testid="calendar-prev"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={onToday}
        className="h-9 px-3 border rounded-md text-sm hover:bg-muted transition-colors"
        data-testid="calendar-today"
      >
        Today
      </button>
      <button
        type="button"
        onClick={handleNext}
        className="h-9 w-9 flex items-center justify-center border rounded-md hover:bg-muted transition-colors"
        aria-label="Next window"
        data-testid="calendar-next"
      >
        <ChevronRight size={16} />
      </button>
      <span
        className="text-xs text-muted-foreground ml-2"
        data-testid="calendar-window-label"
      >
        {fromIso} → {addDays(toIso, -1)}
      </span>
    </div>
  );
}
