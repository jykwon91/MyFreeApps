import { useGetMarketRateBenchmarksQuery } from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import { useGetUtilityPlanRateComparisonQuery, useGetUtilityPlanRenewalAlertsQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { UTILITY_PLAN_MESSAGES as MESSAGES } from "../../constants/utilityPlans";
import HomeLinkRow from "../home/HomeLinkRow";

/** Counts are what each drill-down would find. A count that couldn't load is left out rather than guessed. */
function withDetail(label: string, detail: string | undefined): string {
  return detail ? `${label}, ${detail}` : label;
}

function countDetail(count: number | undefined): string | undefined {
  if (count === undefined) return undefined;
  return count === 0 ? MESSAGES.glanceClear : MESSAGES.glanceCount(count);
}

/** The glance: what needs attention across every plan, each with its own screen to explore. */
export default function UtilityPlansGlance() {
  const { colors, spacing, fontSize } = useTheme();
  const { data: alerts } = useGetUtilityPlanRenewalAlertsQuery();
  const { data: comparison } = useGetUtilityPlanRateComparisonQuery();
  const { data: benchmarks } = useGetMarketRateBenchmarksQuery();
  const renewals = countDetail(alerts?.total_needing_attention);
  const rateCheck = countDetail(comparison?.total_above_market);
  const marketRates = benchmarks === undefined ? undefined : benchmarks.length === 0 ? MESSAGES.glanceNoneRecorded : MESSAGES.glanceCount(benchmarks.length);
  const attention = (count: number | undefined) => (count ? colors.destructiveText : undefined);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.glanceTitle}
      </Text>
      <HomeLinkRow
        accessibilityLabel={withDetail(MESSAGES.glanceRenewals, renewals)}
        detail={renewals}
        detailColor={attention(alerts?.total_needing_attention)}
        label={MESSAGES.glanceRenewals}
        onPress={() => router.push("/utility-plans/renewals")}
      />
      <HomeLinkRow
        accessibilityLabel={withDetail(MESSAGES.glanceRateCheck, rateCheck)}
        detail={rateCheck}
        detailColor={attention(comparison?.total_above_market)}
        label={MESSAGES.glanceRateCheck}
        onPress={() => router.push("/utility-plans/rate-check")}
      />
      <HomeLinkRow label={MESSAGES.glanceBetterPlans} onPress={() => router.push("/utility-plans/better")} />
      <HomeLinkRow
        accessibilityLabel={withDetail(MESSAGES.glanceMarketRates, marketRates)}
        detail={marketRates}
        label={MESSAGES.glanceMarketRates}
        onPress={() => router.push("/utility-plans/market-rates")}
      />
    </View>
  );
}
