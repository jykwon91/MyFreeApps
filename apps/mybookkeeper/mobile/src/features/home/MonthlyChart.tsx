import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import { GroupedBarChart, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { HOME_CHART_HEIGHT } from "../../constants/home";
import { NO_FILTERS } from "../../constants/transactionFilters";
import { monthName } from "../../lib/localDate";
import { transactionsLink } from "../transactions/transactionFilters";
import HomeCard from "./HomeCard";
import { chartMonths } from "./homeCharts";
import { axisMoney, monthlyChartSummary, spokenMonth } from "./homeDisplay";

/** Revenue against expenses for the last months of the period. A month opens the rows behind it. */
export default function MonthlyChart({ byMonth }: { byMonth: readonly MonthSummary[] }) {
  const { colors } = useTheme();
  const months = chartMonths(byMonth);
  if (months.length < 2) return null;

  return (
    <HomeCard title="Month by month">
      <GroupedBarChart
        accessibilityLabel={monthlyChartSummary(months)}
        formatValue={axisMoney}
        groups={months.map((month) => ({
          key: month.month,
          label: monthName(month.month, "short"),
          values: [month.revenue, month.expenses],
          accessibilityLabel: spokenMonth(month),
          onPress: () => router.navigate(transactionsLink({ ...NO_FILTERS, month: month.month, approvedOnly: true })),
        }))}
        height={HOME_CHART_HEIGHT}
        series={[
          { label: "Revenue", color: colors.positiveText },
          { label: "Expenses", color: colors.destructiveText },
        ]}
        testID="home-monthly-chart"
      />
    </HomeCard>
  );
}
