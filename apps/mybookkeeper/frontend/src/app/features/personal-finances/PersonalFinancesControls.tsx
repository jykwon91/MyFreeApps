import { formatMonthShort } from "@mybookkeeper/api-client/utils/monthText";
import type { PersonalFinancesQuery } from "@mybookkeeper/api-client/types/personal-finances/personal-finances-query";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import { PERSONAL_FINANCES_ALL_TIME } from "@/shared/lib/personal-finances-pages";
import { yearAround, yearOf, yearQuery } from "./personal-finances-search-params";

export interface PersonalFinancesControlsProps {
  value: PersonalFinancesQuery;
  /** Every year the bank history touches, newest first. */
  years: number[];
  onChange: (query: PersonalFinancesQuery) => void;
}

const ALL: PersonalFinancesQuery = { start: null, end: null };

/** Pick a year or all time; after a drag across the chart, say which months
 * are showing and offer the way back. */
export default function PersonalFinancesControls({ value, years, onChange }: PersonalFinancesControlsProps) {
  const year = yearOf(value);
  const isAllTime = value.start === null && value.end === null;
  const isCustom = !isAllTime && year === null;
  const around = yearAround(value);

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="personal-finances-controls">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{MSG.rangeLabel}</span>
        <select
          className="min-h-[44px] rounded-md border bg-background px-3 text-sm"
          value={year === null ? (isAllTime ? PERSONAL_FINANCES_ALL_TIME : "") : String(year)}
          onChange={(e) => onChange(e.target.value === PERSONAL_FINANCES_ALL_TIME ? ALL : yearQuery(Number(e.target.value)))}
          data-testid="personal-finances-year"
        >
          {isCustom && <option value="" disabled>{MSG.customRange(formatMonthShort(value.start ?? ""), formatMonthShort(value.end ?? ""))}</option>}
          <option value={PERSONAL_FINANCES_ALL_TIME}>{MSG.allTime}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </label>
      {isCustom && (
        <button
          type="button"
          className="min-h-[44px] px-2 text-sm font-medium text-primary hover:underline"
          onClick={() => onChange(around === null ? ALL : yearQuery(around))}
          data-testid="personal-finances-reset-range"
        >
          {around === null ? MSG.resetAll : MSG.resetRange}
        </button>
      )}
    </div>
  );
}
