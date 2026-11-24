import { NET_WORTH_RANGES } from "@mybookkeeper/api-client/constants/netWorth";
import type { NetWorthRange } from "@mybookkeeper/api-client/types/net-worth/net-worth-range";
import SegmentedControl from "@/shared/components/ui/SegmentedControl";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

export interface NetWorthRangePickerProps {
  value: NetWorthRange;
  onChange: (range: NetWorthRange) => void;
}

/** 1M / 3M / 1Y / All, as a row of toggle buttons. */
export default function NetWorthRangePicker({ value, onChange }: NetWorthRangePickerProps) {
  return (
    <SegmentedControl
      options={NET_WORTH_RANGES}
      value={value}
      onChange={onChange}
      label={MSG.rangeLabel}
      testIdPrefix="net-worth-range"
    />
  );
}
