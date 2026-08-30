import { formatCurrency } from "@/shared/utils/currency";

export interface RentTotalsLineProps {
  totalCharged: string;
  totalPaid: string;
}

/**
 * The two lifetime totals the balance is the difference of.
 *
 * Shown beside the balance so "owes $422.58" can be checked against the
 * numbers it came from rather than taken on faith.
 */
export default function RentTotalsLine({
  totalCharged,
  totalPaid,
}: RentTotalsLineProps) {
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {formatCurrency(totalPaid)} paid of {formatCurrency(totalCharged)} charged
    </span>
  );
}
