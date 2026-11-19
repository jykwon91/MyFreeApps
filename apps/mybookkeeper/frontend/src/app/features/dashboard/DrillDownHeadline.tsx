import { formatCurrency } from "@/shared/utils/currency";
import { LIST_LOAD_MODE } from "@/shared/lib/list-load-modes";
import type { ListLoadMode } from "@/shared/types/list-load-mode";

export interface DrillDownHeadlineProps {
  listMode: ListLoadMode;
  /** How many rows match across every page, from the server. */
  count: number;
  /** What every matching row adds up to, from the server. */
  amountTotal: number;
}

/** "N transactions — $total" for the whole filter, once the list has answered; nothing while loading or failed. */
export default function DrillDownHeadline({ listMode, count, amountTotal }: DrillDownHeadlineProps) {
  if (listMode !== LIST_LOAD_MODE.list && listMode !== LIST_LOAD_MODE.empty) return null;
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      {count} transaction{count !== 1 ? "s" : ""} — {formatCurrency(amountTotal)}
    </p>
  );
}
