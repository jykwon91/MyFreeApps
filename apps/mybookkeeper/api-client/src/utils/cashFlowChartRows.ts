import type { CashFlowChartRow } from "../types/cash-flow/cash-flow-chart-row";
import type { CashFlowMonth } from "../types/cash-flow/cash-flow-month";
import { formatMonthShort } from "./monthText";

/** Cash flow months as chart rows: cents to dollars, money out split into
 * spending and mortgage and loan payments, each month labelled "Nov 26". */
export function cashFlowChartRows(months: readonly CashFlowMonth[]): CashFlowChartRow[] {
  return months.map((month) => ({
    month: month.month,
    label: formatMonthShort(month.month),
    moneyIn: month.money_in_cents / 100,
    moneyOut: month.money_out_cents / 100,
    spending: (month.money_out_cents - month.mortgages_loans_cents) / 100,
    mortgagesLoans: month.mortgages_loans_cents / 100,
    net: month.net_cents / 100,
  }));
}
