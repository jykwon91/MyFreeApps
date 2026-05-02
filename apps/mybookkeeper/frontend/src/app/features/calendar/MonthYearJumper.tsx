import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  firstOfMonth,
  formatMonthYear,
  parseIsoDate,
} from "@/app/features/calendar/calendar-utils";

interface Props {
  fromIso: string;
  onJump: (newFromIso: string) => void;
}

const MONTH_LABELS: ReadonlyArray<string> = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEAR_LOOKBACK = 2;
const YEAR_LOOKAHEAD = 5;

/**
 * Clickable month/year label that opens a small popover with month +
 * year dropdowns. Selecting either jumps the calendar's `from` date to
 * the first of that month/year, preserving the current window length
 * (handled by the parent).
 *
 * Implementation note: deliberately a vanilla popover with a click-
 * outside handler — Radix Popover would work but adds bundle weight
 * for a single small surface. Two `<select>` elements give us native
 * keyboard support and accessibility for free.
 */
export default function MonthYearJumper({ fromIso, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fromDate = parseIsoDate(fromIso);
  const currentYear = fromDate.getUTCFullYear();
  const currentMonth = fromDate.getUTCMonth();

  const today = new Date();
  const minYear = today.getUTCFullYear() - YEAR_LOOKBACK;
  const maxYear = today.getUTCFullYear() + YEAR_LOOKAHEAD;
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i,
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  function handleMonthChange(monthZeroIndexed: number) {
    onJump(firstOfMonth(currentYear, monthZeroIndexed));
    setOpen(false);
  }

  function handleYearChange(year: number) {
    onJump(firstOfMonth(year, currentMonth));
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-9 px-3 inline-flex items-center gap-1 border rounded-md text-sm font-medium hover:bg-muted transition-colors"
        data-testid="calendar-month-jumper"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Jump to a different month or year. Currently ${formatMonthYear(fromIso)}.`}
      >
        {formatMonthYear(fromIso)}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Pick a month and year"
          className="absolute top-full left-0 mt-1 z-30 bg-card border rounded-md shadow-lg p-2 flex gap-2"
          data-testid="calendar-month-jumper-popover"
        >
          <select
            value={currentMonth}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            className="rounded border bg-background px-2 py-1 text-sm min-h-[36px]"
            aria-label="Month"
            data-testid="calendar-month-jumper-month"
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={currentYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            className="rounded border bg-background px-2 py-1 text-sm min-h-[36px]"
            aria-label="Year"
            data-testid="calendar-month-jumper-year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
