import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { formatGainLossPercent, gainLossDirection } from "@mybookkeeper/api-client/utils/holdingFormat";

export interface HoldingGainLossProps {
  cents: number | null;
  percent: number | null;
  currency: string;
  /** Stack the percent under the amount (table) or put it beside it (card). */
  layout?: "stacked" | "inline";
}

const TONE = {
  gain: "text-green-600 dark:text-green-400",
  loss: "text-red-600 dark:text-red-400",
  flat: "text-muted-foreground",
} as const;

/** A gain or loss in dollars and percent, green up and red down; a dash without a cost basis. */
export default function HoldingGainLoss({ cents, percent, currency, layout = "stacked" }: HoldingGainLossProps) {
  const direction = gainLossDirection(cents);
  if (cents === null || direction === null) return <span className="text-muted-foreground">—</span>;
  const sign = cents > 0 ? "+" : "";
  const container = layout === "stacked" ? "flex flex-col items-end" : "inline-flex items-baseline gap-1.5";
  return (
    <span className={`${container} tabular-nums ${TONE[direction]}`} data-testid="holding-gain-loss">
      <span>{sign}{formatAccountBalance(cents, currency)}</span>
      <span className="text-xs">{formatGainLossPercent(percent)}</span>
    </span>
  );
}
