import { formatMonthShort } from "./monthText";
import type { PersonalFinancesChartRow } from "../types/personal-finances/personal-finances-chart-row";
import type { PersonalFinancesMonth } from "../types/personal-finances/personal-finances-month";

/** Personal finances months as chart rows: cents to dollars, expenses split
 * into spending and mortgage and loan payments, each month labelled "Nov 26". */
export function personalFinancesChartRows(months: readonly PersonalFinancesMonth[]): PersonalFinancesChartRow[] {
  return months.map((month) => ({
    month: month.month,
    label: formatMonthShort(month.month),
    income: month.income_cents / 100,
    spending: (month.expenses_cents - month.mortgages_loans_cents) / 100,
    mortgagesLoans: month.mortgages_loans_cents / 100,
    net: month.net_cents / 100,
  }));
}
