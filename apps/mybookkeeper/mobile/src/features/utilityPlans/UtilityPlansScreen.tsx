import { useGetUtilityPlansQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { UTILITY_PLAN_LIST_LIMIT, UTILITY_PLAN_MESSAGES } from "../../constants/utilityPlans";
import { useTodayIso } from "../../lib/useTodayIso";
import { useOpenLink } from "../inquiries/useOpenLink";
import { sortedPlans } from "./utilityPlanDisplay";
import UtilityPlanRow from "./UtilityPlanRow";
import UtilityPlansSkeleton from "./UtilityPlansSkeleton";

export default function UtilityPlansScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const todayIso = useTodayIso();
  const { currentData, error, isFetching, refetch } = useGetUtilityPlansQuery({ limit: UTILITY_PLAN_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = useMemo(() => sortedPlans(currentData?.items ?? [], todayIso), [currentData, todayIso]);
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/utility-plans`);

  const emptyList = !currentData && isFetching ? (
    <UtilityPlansSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: UTILITY_PLAN_MESSAGES.tryAgain, onPress: refresh }}
      body={UTILITY_PLAN_MESSAGES.tryAgainOffer}
      heading={UTILITY_PLAN_MESSAGES.couldntLoadList}
    />
  ) : (
    <EmptyState
      action={{ label: UTILITY_PLAN_MESSAGES.openWebsite, onPress: openWebsite }}
      body={UTILITY_PLAN_MESSAGES.noneBody}
      heading={UTILITY_PLAN_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {currentData?.has_more ? UTILITY_PLAN_MESSAGES.moreOnWebsite : UTILITY_PLAN_MESSAGES.manageOnWebsite}
            </Text>
            <LoadingButton onPress={openWebsite} variant="ghost">
              {UTILITY_PLAN_MESSAGES.openWebsite}
            </LoadingButton>
          </View>
        ) : undefined
      }
      ListHeaderComponent={
        error && rows.length > 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Banner message={SHOWING_LAST_LOADED_MESSAGE} />
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(plan) => plan.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <UtilityPlanRow onPress={() => router.push(`/utility-plans/${item.id}`)} plan={item} todayIso={todayIso} />}
      testID="utility-plans-list"
    />
  );
}
