import type { MonthExpenseSummary } from "@mybookkeeper/api-client/types/summary/MonthExpenseSummary";
import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import { GroupedBarChart, useTheme } from "@platform/mobile";
import { HOME_CHART_HEIGHT } from "../../constants/home";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { monthName } from "../../lib/localDate";
import type { AnalysisScope } from "../../types/AnalysisScope";
import HomeCard from "../home/HomeCard";
import { axisMoney, monthlyChartSummary, spokenMonth } from "../home/homeDisplay";
import MonthRow from "./MonthRow";
import { monthExpenseRows, monthsNewestFirst, monthsOldestFirst } from "./moneyAnalysisDisplay";

interface MonthByMonthCardProps {
  byMonth: readonly MonthSummary[];
  byMonthExpense: readonly MonthExpenseSummary[];
  scope: AnalysisScope;
}

/** Every month in the period (the web chart does the same), as bars and as rows that open into their categories. */
export default function MonthByMonthCard({ byMonth, byMonthExpense, scope }: MonthByMonthCardProps) {
  const { colors } = useTheme();
  if (byMonth.length === 0) return null;
  const oldestFirst = monthsOldestFirst(byMonth);

  return (
    <HomeCard title={MESSAGES.monthByMonth}>
      {byMonth.length > 1 ? (
        <GroupedBarChart
          accessibilityLabel={monthlyChartSummary(oldestFirst)}
          formatValue={axisMoney}
          groups={oldestFirst.map((month) => ({
            key: month.month,
            label: monthName(month.month, "short"),
            values: [month.revenue, month.expenses],
            accessibilityLabel: spokenMonth(month),
          }))}
          height={HOME_CHART_HEIGHT}
          series={[
            { label: MESSAGES.revenue, color: colors.positiveText },
            { label: MESSAGES.expenses, color: colors.destructiveText },
          ]}
          testID="analysis-monthly-chart"
        />
      ) : null}
      {monthsNewestFirst(byMonth).map((month) => (
        <MonthRow expenseRows={monthExpenseRows(byMonthExpense.find((row) => row.month === month.month))} key={month.month} month={month} scope={scope} />
      ))}
    </HomeCard>
  );
}
