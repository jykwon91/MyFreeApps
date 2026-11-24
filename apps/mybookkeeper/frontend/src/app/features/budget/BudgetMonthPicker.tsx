import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatMonthLong, shiftMonth } from "@mybookkeeper/api-client/utils/monthText";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

export interface BudgetMonthPickerProps {
  /** "YYYY-MM". */
  month: string;
  /** "YYYY-MM" of today, so the picker can offer a way back to it. */
  currentMonth: string;
  onChange: (month: string) => void;
}

const ARROW_CLASS = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border hover:bg-muted";

/** Previous / next month arrows around the month's name, and a jump back to this month. */
export default function BudgetMonthPicker({ month, currentMonth, onChange }: BudgetMonthPickerProps) {
  return (
    <div role="group" aria-label={MSG.monthLabel} className="flex flex-wrap items-center gap-2" data-testid="budget-month-picker">
      <button type="button" className={ARROW_CLASS} aria-label={MSG.previousMonth} onClick={() => onChange(shiftMonth(month, -1))} data-testid="budget-month-previous">
        <ChevronLeft size={18} aria-hidden />
      </button>
      <h2 className="min-w-[9rem] text-center text-base font-semibold" aria-live="polite" data-testid="budget-month-label">
        {formatMonthLong(month)}
      </h2>
      <button type="button" className={ARROW_CLASS} aria-label={MSG.nextMonth} onClick={() => onChange(shiftMonth(month, 1))} data-testid="budget-month-next">
        <ChevronRight size={18} aria-hidden />
      </button>
      {month !== currentMonth ? (
        <button
          type="button"
          onClick={() => onChange(currentMonth)}
          className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-primary hover:underline"
          data-testid="budget-month-today"
        >
          {MSG.thisMonth}
        </button>
      ) : null}
    </div>
  );
}
