import { useGetUtilityPlanRenewalAlertsQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { Banner, EmptyState, useRefresh } from "@platform/mobile";
import { ScrollView } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { UTILITY_RENEWAL_MESSAGES as MESSAGES } from "../../constants/utilityInsights";
import { useTodayIso } from "../../lib/useTodayIso";
import UtilityPlanListSection from "./UtilityPlanListSection";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

/** Every plan that has lapsed or is about to, lapsed ones first. */
export default function UtilityRenewalsScreen() {
  const todayIso = useTodayIso();
  const { currentData, error, isFetching, refetch } = useGetUtilityPlanRenewalAlertsQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  function body() {
    if (!currentData && isFetching) return <UtilityPlansSkeleton />;
    if (!currentData) {
      return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoad} />;
    }
    if (currentData.total_needing_attention === 0) {
      return <EmptyState body={MESSAGES.allClear(currentData.window_days)} heading={MESSAGES.allClearHeading} />;
    }
    return (
      <>
        <UtilityPlanListSection heading={MESSAGES.lapsedHeading} plans={currentData.expired} todayIso={todayIso} />
        <UtilityPlanListSection heading={MESSAGES.expiringHeading(currentData.window_days)} plans={currentData.expiring_soon} todayIso={todayIso} />
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
