import { useGetMarketRateBenchmarksQuery } from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import { UTILITY_SERVICE_TYPES } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text } from "react-native";
import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import { useCanWrite } from "../workspace/useCanWrite";
import MarketRateRow from "./MarketRateRow";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

/** Every service's recorded market rate. A writer taps one to record or change it. */
export default function MarketRatesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetMarketRateBenchmarksQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!currentData && isFetching) return <UtilityPlansSkeleton />;
  if (!currentData) {
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />;
  }
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.listIntro}</Text>
      {UTILITY_SERVICE_TYPES.map((serviceType) => (
        <MarketRateRow
          key={serviceType}
          benchmark={currentData.find((benchmark) => benchmark.service_type === serviceType)}
          onPress={canWrite ? () => router.push(`/utility-plans/market-rates/${serviceType}`) : null}
          serviceType={serviceType}
        />
      ))}
    </ScrollView>
  );
}
