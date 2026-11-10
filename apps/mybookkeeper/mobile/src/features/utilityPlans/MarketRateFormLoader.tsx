import { useGetMarketRateBenchmarksQuery } from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import { UTILITY_SERVICE_TYPES } from "@mybookkeeper/api-client/constants/utilityServiceTypes";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { MARKET_RATE_MESSAGES as MESSAGES } from "../../constants/marketRates";
import MarketRateForm from "./MarketRateForm";
import UtilityPlanDetailSkeleton from "./UtilityPlanDetailSkeleton";

function isServiceType(value: string): value is UtilityServiceType {
  return (UTILITY_SERVICE_TYPES as readonly string[]).includes(value);
}

/** The form for one service. It waits for the rates so it opens on the one on file, not an empty form. */
export default function MarketRateFormLoader({ serviceType }: { serviceType: string }) {
  const { currentData, error, isFetching, refetch } = useGetMarketRateBenchmarksQuery();

  if (!isServiceType(serviceType)) {
    return <EmptyState action={{ label: MESSAGES.back, onPress: () => router.back() }} body={MESSAGES.unknownServiceBody} heading={MESSAGES.unknownService} />;
  }
  if (currentData) {
    // Keyed so a reload can't replace what's being typed.
    return <MarketRateForm key={serviceType} existing={currentData.find((benchmark) => benchmark.service_type === serviceType)} serviceType={serviceType} />;
  }
  if (!error || isFetching) return <UtilityPlanDetailSkeleton />;
  return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />;
}
