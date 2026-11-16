import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import { GroupedBarChart, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { HOME_CHART_HEIGHT } from "../../constants/home";
import { monthName } from "../../lib/localDate";
import type { AnalysisScope } from "../../types/AnalysisScope";
import HomeCard from "./HomeCard";
import { chartMonths } from "./homeCharts";
import { axisMoney, monthlyChartSummary, spokenMonth } from "./homeDisplay";
import { monthLink } from "./homeLinks";

/** Revenue against expenses for the last months of the period. A month opens the rows behind it. */
export default function MonthlyChart({ byMonth, scope }: { byMonth: readonly MonthSummary[]; scope: AnalysisScope }) {
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
          onPress: () => router.navigate(monthLink(month.month, scope)),
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
