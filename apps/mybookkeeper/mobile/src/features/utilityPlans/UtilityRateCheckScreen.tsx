import { useGetUtilityPlanRateComparisonQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { UTILITY_RATE_CHECK_MESSAGES as MESSAGES } from "../../constants/utilityInsights";
import UtilityRateCheckRow from "./UtilityRateCheckRow";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

/** Plans priced above the market rate the owner recorded, then the plans that couldn't be checked. */
export default function UtilityRateCheckScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const { currentData, error, isFetching, refetch } = useGetUtilityPlanRateComparisonQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  function heading(text: string) {
    return (
      <Text accessibilityRole="header" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {text}
      </Text>
    );
  }

  function body() {
    if (!currentData && isFetching) return <UtilityPlansSkeleton />;
    if (!currentData) {
      return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />;
    }
    const { above_market: above, not_compared: notCompared, material_gap_pct: gap } = currentData;
    const noBenchmark = above.length === 0 && notCompared.length > 0 && notCompared.every((row) => row.status === "no_benchmark");
    return (
      <>
        {noBenchmark ? (
          <EmptyState
            action={{ label: MESSAGES.recordRate, onPress: () => router.push("/utility-plans/market-rates") }}
            body={MESSAGES.noBenchmark}
            heading={MESSAGES.recordRate}
          />
        ) : above.length === 0 ? (
          <EmptyState body={MESSAGES.allClear(gap)} heading={MESSAGES.allClearHeading} />
        ) : (
          <View>
            {heading(MESSAGES.aboveHeading(gap))}
            {above.map((row) => (
              <UtilityRateCheckRow key={row.plan.id} row={row} />
            ))}
          </View>
        )}
        {currentData.has_stale_benchmark ? (
          <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.staleCard}</Text>
        ) : null}
        {notCompared.length > 0 && !noBenchmark ? (
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
      {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {body()}
    </ScrollView>
  );
}
