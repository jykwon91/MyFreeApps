import type { RentalRoiGapBasis } from "@mybookkeeper/api-client/types/analytics/rental-roi-gap-basis";
import { describeGap, formatSignedMoneyCents } from "@mybookkeeper/api-client/utils/rentalRoi";
import { cn } from "@/shared/utils/cn";

export interface RentalRoiGapProps {
  cents: number;
  basis: RentalRoiGapBasis;
  className?: string;
}

/** A gap as a signed number and in words, so it never relies on color alone. */
export default function RentalRoiGap({ cents, basis, className }: RentalRoiGapProps) {
  const words = describeGap(cents);
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className={cn("font-semibold", cents < 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
        {formatSignedMoneyCents(cents)}
      </span>
      <span className="text-xs text-muted-foreground font-normal">
        {basis === "break_even" ? `${words} vs. break-even` : words}
      </span>
    </span>
  );
}
