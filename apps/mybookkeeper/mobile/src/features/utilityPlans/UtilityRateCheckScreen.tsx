import { useGetMarketRateBenchmarksQuery } from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import { useGetUtilityPlanRateComparisonQuery, useGetUtilityPlansQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { UTILITY_RATE_CHECK_MESSAGES as MESSAGES } from "../../constants/utilityInsights";
import { useCanWrite } from "../workspace/useCanWrite";
import UtilityRateCheckRow from "./UtilityRateCheckRow";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

/** Plans priced above the market rate the owner recorded, then the plans that couldn't be checked. */
export default function UtilityRateCheckScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const comparison = useGetUtilityPlanRateComparisonQuery();
  const benchmarks = useGetMarketRateBenchmarksQuery();
  const plans = useGetUtilityPlansQuery({ limit: 1 });
  const error = comparison.error ?? benchmarks.error ?? plans.error;
  const { refresh, refreshControl } = useRefresh(async () => {
    await Promise.all([comparison.refetch(), benchmarks.refetch(), plans.refetch()]);
  }, error);
  const data = comparison.currentData;
  const recorded = benchmarks.currentData;
  const planTotal = plans.currentData?.total;

  function heading(text: string) {
    return (
      <Text accessibilityRole="header" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {text}
      </Text>
    );
  }

  function body() {
    const isLoading = comparison.isFetching || benchmarks.isFetching || plans.isFetching;
    if ((!data || !recorded || planTotal === undefined) && isLoading) return <UtilityPlansSkeleton />;
    // A failed benchmarks or plans query must not read as "none recorded" or "none tracked": both would look like an all-clear.
    if (!data || !recorded || planTotal === undefined) {
      return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />;
    }
    if (planTotal === 0) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.addPlan, onPress: () => router.push("/utility-plans/new") } : undefined}
          body={MESSAGES.noPlansBody}
          heading={MESSAGES.noPlansHeading}
        />
      );
    }
    if (recorded.length === 0) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.recordRate, onPress: () => router.push("/utility-plans/market-rates") } : undefined}
          body={canWrite ? MESSAGES.noBenchmark : MESSAGES.noBenchmarkViewOnly}
          heading={MESSAGES.noBenchmarkHeading}
        />
      );
    }
    const { above_market: above, not_compared: notCompared, material_gap_pct: gap } = data;
    return (
      <>
        {above.length === 0 ? (
          <EmptyState body={MESSAGES.allClear(gap)} heading={MESSAGES.allClearHeading} />
        ) : (
          <View>
            {heading(MESSAGES.aboveHeading(gap))}
            {above.map((row) => (
              <UtilityRateCheckRow key={row.plan.id} row={row} />
            ))}
          </View>
        )}
        {data.has_stale_benchmark ? (
          <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.staleCard}</Text>
        ) : null}
        {notCompared.length > 0 ? (
          <View>
            {heading(MESSAGES.notCheckedHeading(notCompared.length))}
            {notCompared.map((row) => (
              <UtilityRateCheckRow key={row.plan.id} row={row} />
            ))}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error && data ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {body()}
    </ScrollView>
  );
}
