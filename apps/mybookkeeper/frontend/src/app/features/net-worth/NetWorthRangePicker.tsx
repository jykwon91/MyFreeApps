import { NET_WORTH_RANGES } from "@mybookkeeper/api-client/constants/netWorth";
import type { NetWorthRange } from "@mybookkeeper/api-client/types/net-worth/net-worth-range";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

export interface NetWorthRangePickerProps {
  value: NetWorthRange;
  onChange: (range: NetWorthRange) => void;
}

/** 1M / 3M / 1Y / All, as a row of toggle buttons. */
export default function NetWorthRangePicker({ value, onChange }: NetWorthRangePickerProps) {
  return (
    <div role="group" aria-label={MSG.rangeLabel} className="inline-flex rounded-md border" data-testid="net-worth-range">
      {NET_WORTH_RANGES.map((range) => {
        const selected = range.key === value;
        return (
          <button
            key={range.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range.key)}
            className={`min-h-[44px] min-w-[44px] px-3 text-sm font-medium first:rounded-l-md last:rounded-r-md ${selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            data-testid={`net-worth-range-${range.key}`}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}
