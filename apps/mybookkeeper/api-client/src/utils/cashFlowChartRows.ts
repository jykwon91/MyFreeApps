import type { CashFlowChartRow } from "../types/cash-flow/cash-flow-chart-row";
import type { CashFlowMonth } from "../types/cash-flow/cash-flow-month";
import { formatMonthShort } from "./monthText";

/** Cash flow months as chart rows: cents to dollars, each month labelled "Nov 26". */
export function cashFlowChartRows(months: readonly CashFlowMonth[]): CashFlowChartRow[] {
  return months.map((month) => ({
    month: month.month,
    label: formatMonthShort(month.month),
    moneyIn: month.money_in_cents / 100,
    moneyOut: month.money_out_cents / 100,
    net: month.net_cents / 100,
  }));
}
