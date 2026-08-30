import { formatCurrency } from "@/shared/utils/currency";

export interface RentBalanceLineProps {
  balance: string;
  totalCharged: string;
  totalPaid: string;
}

interface TotalsProps {
  totalCharged: string;
  totalPaid: string;
}

function Totals({ totalCharged, totalPaid }: TotalsProps) {
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {formatCurrency(totalPaid)} paid of {formatCurrency(totalCharged)} charged
    </span>
  );
}

/**
 * The lifetime position, one line.
 *
 * Kept separate from the current-period card because the two can disagree in a
 * way that matters: a tenant can be on track this month and still be a month
 * behind overall, and a single blended number would hide both facts.
 */
export default function RentBalanceLine({
  balance,
  totalCharged,
  totalPaid,
}: RentBalanceLineProps) {
  const owed = parseFloat(balance);
  const totals = <Totals totalCharged={totalCharged} totalPaid={totalPaid} />;

  if (Math.abs(owed) < 0.005) {
    return (
      <div
        className="flex items-baseline justify-between gap-3 flex-wrap text-sm"
        data-testid="rent-balance-line"
      >
        <span className="text-muted-foreground">All settled — nothing outstanding.</span>
        {totals}
      </div>
    );
  }

  if (owed > 0) {
    return (
      <div
        className="flex items-baseline justify-between gap-3 flex-wrap text-sm"
        data-testid="rent-balance-line"
      >
        <span className="font-medium">
          Owes{" "}
          <span
            className="text-red-600 dark:text-red-400 tabular-nums"
            data-testid="rent-balance-owed"
          >
            {formatCurrency(owed)}
          </span>{" "}
          overall
        </span>
        {totals}
      </div>
    );
  }

  return (
    <div
      className="flex items-baseline justify-between gap-3 flex-wrap text-sm"
      data-testid="rent-balance-line"
    >
      <span className="font-medium">
        Paid ahead by{" "}
        <span
          className="text-green-600 dark:text-green-400 tabular-nums"
          data-testid="rent-balance-credit"
        >
          {formatCurrency(-owed)}
        </span>
      </span>
      {totals}
    </div>
  );
}
