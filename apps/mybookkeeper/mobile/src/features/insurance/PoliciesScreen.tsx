import { useGetInsurancePoliciesQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { EXPIRING_FILTER_DAYS, INSURANCE_MESSAGES, POLICY_LIST_LIMIT } from "../../constants/insurance";
import { addDays } from "../../lib/localDate";
import { useTodayIso } from "../../lib/useTodayIso";
import type { PolicyFilter } from "../../types/PolicyFilter";
import { useCanWrite } from "../workspace/useCanWrite";
import PoliciesFilterSheet from "./PoliciesFilterSheet";
import PoliciesHeader from "./PoliciesHeader";
import PoliciesSkeleton from "./PoliciesSkeleton";
import { sortedPolicies } from "./policyDisplay";
import PolicyRow from "./PolicyRow";

export default function PoliciesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const todayIso = useTodayIso();
  const [filter, setFilter] = useState<PolicyFilter>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const { currentData, error, isFetching, refetch } = useGetInsurancePoliciesQuery({
    limit: POLICY_LIST_LIMIT,
    ...(filter === "expiring" ? { expiring_before: addDays(todayIso, EXPIRING_FILTER_DAYS) } : {}),
  });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = useMemo(() => sortedPolicies(currentData?.items ?? [], todayIso), [currentData, todayIso]);

  const emptyList = !currentData && isFetching ? (
    <PoliciesSkeleton />
  ) : error ? (
    <EmptyState action={{ label: INSURANCE_MESSAGES.tryAgain, onPress: refresh }} body={INSURANCE_MESSAGES.tryAgainOffer} heading={INSURANCE_MESSAGES.couldntLoadList} />
  ) : filter === "expiring" ? (
    <EmptyState action={{ label: INSURANCE_MESSAGES.showAll, onPress: () => setFilter("all") }} body={INSURANCE_MESSAGES.noneExpiring} heading={INSURANCE_MESSAGES.noneExpiringHeading} />
  ) : (
    <EmptyState
      action={canWrite ? { label: INSURANCE_MESSAGES.addPolicy, onPress: () => router.push("/insurance/new") } : undefined}
      body={INSURANCE_MESSAGES.noneBody}
      heading={INSURANCE_MESSAGES.noneHeading}
    />
  );

  return (
    <>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          currentData?.has_more ? (
            <View style={{ padding: spacing.lg }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_MESSAGES.moreThanShown}</Text>
            </View>
          ) : undefined
        }
        ListHeaderComponent={
          <>
            <PoliciesHeader canWrite={canWrite} filter={filter} onOpenFilter={() => setIsFilterOpen(true)} />
            {error && rows.length > 0 ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                <Banner message={SHOWING_LAST_LOADED_MESSAGE} />
              </View>
            ) : null}
          </>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(policy) => policy.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <PolicyRow onPress={() => router.push(`/insurance/${item.id}`)} policy={item} todayIso={todayIso} />}
        testID="policies-list"
      />
      <PoliciesFilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onSelect={(next) => {
          setIsFilterOpen(false);
          setFilter(next);
        }}
        value={filter}
      />
    </>
  );
}
