import type { UtilityPlanRateComparisonRow } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-comparison-row";
import { UTILITY_PLAN_BENCHMARK_STATUS_LABELS } from "@mybookkeeper/api-client/constants/utilityPlanBenchmarkLabels";
import { formatBenchmarkGap } from "@mybookkeeper/api-client/utils/benchmarkFormat";
import { formatComparisonFigure } from "@mybookkeeper/api-client/utils/utilityPlanFormat";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text } from "react-native";
import { UTILITY_RATE_CHECK_MESSAGES as MESSAGES } from "../../constants/utilityInsights";
import { planProvider, planTitle } from "./utilityPlanDisplay";

/** One plan against its market rate. A plan with nothing to compare shows why instead of figures. */
export default function UtilityRateCheckRow({ row }: { row: UtilityPlanRateComparisonRow }) {
  const { colors, spacing, fontSize } = useTheme();
  const { plan } = row;
  const compared = row.gap_pct !== null;
  const lines = [
    compared ? formatBenchmarkGap(row.gap_pct) : UTILITY_PLAN_BENCHMARK_STATUS_LABELS[row.status],
    compared ? MESSAGES.planFigure(formatComparisonFigure(row.plan_figure, plan.service_type)) : null,
    compared ? MESSAGES.marketFigure(formatComparisonFigure(row.benchmark_figure, plan.service_type)) : null,
    row.benchmark_is_stale ? MESSAGES.staleRow : null,
  ].filter((line): line is string => line !== null);
  return (
    <Pressable
      accessibilityLabel={[planTitle(plan), planProvider(plan), ...lines].join(", ")}
      accessibilityRole="button"
      onPress={() => router.push(`/utility-plans/${plan.id}`)}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {planTitle(plan)}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {planProvider(plan)}
      </Text>
      {lines.map((line, index) => (
        <Text key={line} style={{ fontSize: fontSize.sm, fontWeight: index === 0 ? "600" : "400", color: index === 0 && compared ? colors.destructiveText : colors.foreground }}>
          {line}
        </Text>
      ))}
    </Pressable>
  );
}
