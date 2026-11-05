import { useGetInsurancePoliciesQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { INSURANCE_MESSAGES, POLICY_LIST_LIMIT } from "../../constants/insurance";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useTodayIso } from "../../lib/useTodayIso";
import { useOpenLink } from "../inquiries/useOpenLink";
import PoliciesSkeleton from "./PoliciesSkeleton";
import { sortedPolicies } from "./policyDisplay";
import PolicyRow from "./PolicyRow";

export default function PoliciesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData, error, isFetching, refetch } = useGetInsurancePoliciesQuery({ limit: POLICY_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const todayIso = useTodayIso();
  const rows = useMemo(() => sortedPolicies(currentData?.items ?? [], todayIso), [currentData, todayIso]);
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/insurance-policies`);

  const emptyList = isFetching ? (
    <PoliciesSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: INSURANCE_MESSAGES.tryAgain, onPress: refresh }}
      body={INSURANCE_MESSAGES.tryAgainOffer}
      heading={INSURANCE_MESSAGES.couldntLoadList}
    />
  ) : (
    <EmptyState
      action={{ label: INSURANCE_MESSAGES.openWebsite, onPress: openWebsite }}
      body={INSURANCE_MESSAGES.noneBody}
      heading={INSURANCE_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {currentData?.has_more ? INSURANCE_MESSAGES.moreOnWebsite : INSURANCE_MESSAGES.manageOnWebsite}
            </Text>
            <LoadingButton onPress={openWebsite} variant="ghost">
              {INSURANCE_MESSAGES.openWebsite}
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
      keyExtractor={(policy) => policy.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <PolicyRow onPress={() => router.push(`/insurance/${item.id}`)} policy={item} todayIso={todayIso} />}
      testID="policies-list"
    />
  );
}
