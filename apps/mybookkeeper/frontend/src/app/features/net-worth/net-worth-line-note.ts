import type { NetWorthLine } from "@mybookkeeper/api-client/types/net-worth/net-worth-line";
import { formatAccountDate } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

/** The small print under a line's amount: why it isn't counted, how old it is, or since when. */
export function netWorthLineNote(line: NetWorthLine, totalCurrency: string): string {
  if (line.amount_cents === null || line.as_of === null) return MSG.noValue;
  if (line.currency !== totalCurrency) return MSG.otherCurrency(line.currency);
  if (!line.in_total) return MSG.notInTotal;
  const date = formatAccountDate(line.as_of);
  return line.is_stale ? MSG.stale(date) : MSG.asOf(date);
}
