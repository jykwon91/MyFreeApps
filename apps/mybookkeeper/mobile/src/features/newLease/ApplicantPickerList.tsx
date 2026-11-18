import { useListApplicantPagesInfiniteQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { EmptyState, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { STAGES_READY_FOR_LEASE } from "../../constants/applicants";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { uniqueById } from "../../lib/uniqueById";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import ApplicantRow from "../applicants/ApplicantRow";
import ApplicantsSkeleton, { ApplicantSkeletonRow } from "../applicants/ApplicantsSkeleton";
import PagedListFooter from "../shell/PagedListFooter";
import { useLoadMoreFailure } from "../shell/useLoadMoreFailure";
import { nextPath } from "./newLeaseFlow";

const [APPROVED, LEASE_SENT] = STAGES_READY_FOR_LEASE;

export default function ApplicantPickerList({ flow }: { flow: NewLeaseFlow }) {
  const { colors, spacing, fontSize } = useTheme();
  // The server filters on one stage at a time.
  const approved = useListApplicantPagesInfiniteQuery({ stage: APPROVED });
  const leaseSent = useListApplicantPagesInfiniteQuery({ stage: LEASE_SENT });
  const lists = [approved, leaseSent];
  const error = approved.error ?? leaseSent.error;
  const { loadMoreFailed, loadMore, clearLoadMoreFailure } = useLoadMoreFailure(async () => {
    const results = await Promise.all(lists.filter((list) => list.hasNextPage).map((list) => list.fetchNextPage()));
    return results.some((result) => result.isError);
  });
  const { refresh, refreshControl } = useRefresh(async () => {
    clearLoadMoreFailure();
    await Promise.all(lists.map((list) => list.refetch()));
  }, error);
  const isLoaded = Boolean(approved.currentData && leaseSent.currentData);
  const rows = useMemo(
    () =>
      uniqueById([
        ...(approved.currentData?.pages.flatMap((page) => page.items) ?? []),
        ...(leaseSent.currentData?.pages.flatMap((page) => page.items) ?? []),
      ]),
    [approved.currentData, leaseSent.currentData],
  );
  const isLoadingMore = lists.some((list) => list.isFetchingNextPage);
  const hasMore = lists.some((list) => list.hasNextPage);

  // With only one of the two lists, someone would look like they aren't ready.
  const emptyList = isLoaded ? (
    <EmptyState body={MESSAGES.noApplicantsBody} heading={MESSAGES.noApplicantsHeading} />
  ) : error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadApplicants} />
  ) : (
    <ApplicantsSkeleton label={MESSAGES.loadingApplicants} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={isLoadingMore}
          loadMoreFailed={loadMoreFailed}
          loadingLabel={MESSAGES.loadingMoreApplicants}
          onRetry={() => void loadMore()}
          skeletonRow={<ApplicantSkeletonRow />}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, padding: spacing.lg }}>
          <StaleDataBanner isShown={Boolean(error && isLoaded && !loadMoreFailed)} />
          <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.whoFor}
          </Text>
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={isLoaded ? rows : []}
      keyExtractor={(applicant) => applicant.id}
      onEndReached={() => {
        if (hasMore && !isLoadingMore && !loadMoreFailed) void loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ApplicantRow applicant={item} onPress={() => router.push(nextPath({ ...flow, applicantId: item.id }))} showStage />}
      style={{ flex: 1 }}
      testID="applicant-picker-list"
    />
  );
}
