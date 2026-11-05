import { APPLICANT_STAGES } from "@mybookkeeper/api-client/constants/applicantLabels";
import { useListApplicantPagesInfiniteQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { Banner, EmptyState, LoadingButton, OptionSheet, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { ALL_STAGES_OPTION } from "../../constants/inquiries";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { uniqueById } from "../../lib/uniqueById";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { applicantStageLabel } from "./applicantDisplay";
import ApplicantRow from "./ApplicantRow";
import ApplicantsSkeleton, { ApplicantSkeletonRow } from "./ApplicantsSkeleton";

const STAGE_OPTIONS = [
  { value: ALL_STAGES_OPTION, label: "All" },
  ...APPLICANT_STAGES.map((stage) => ({ value: stage as string, label: applicantStageLabel(stage) })),
];

export default function ApplicantsScreen({
  stage,
  onStageChange,
  onSeeInquiries,
}: {
  stage: ApplicantStage | null;
  onStageChange: (stage: ApplicantStage | null) => void;
  onSeeInquiries: () => void;
}) {
  const { spacing } = useTheme();
  const [isStageSheetOpen, setIsStageSheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const args = useMemo(() => (stage ? { stage } : {}), [stage]);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } =
    useListApplicantPagesInfiniteQuery(args);
  const listKey = JSON.stringify(args);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);
  const rows = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  const emptyList = !currentData && isFetching ? (
    <ApplicantsSkeleton />
  ) : error ? (
    <EmptyState action={{ label: "Try again", onPress: refresh }} body="Want me to try again?" heading="I couldn't load your applicants." />
  ) : stage ? (
    <EmptyState action={{ label: "Clear filter", onPress: () => onStageChange(null) }} body="No applicants are at that stage." heading="Nothing matches that" />
  ) : (
    <EmptyState
      action={{ label: "See inquiries", onPress: onSeeInquiries }}
      body="When you promote an inquiry, they'll show up here."
      heading="No applicants yet"
    />
  );

  const footer = isFetchingNextPage ? <ApplicantSkeletonRow /> : loadMoreFailed ? <LoadMoreFailed onRetry={() => void loadMore()} /> : undefined;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={footer}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <LoadingButton onPress={() => setIsStageSheetOpen(true)} variant="secondary">
              {`Stage: ${stage ? applicantStageLabel(stage) : "All"}`}
            </LoadingButton>
          </View>
        }
        data={rows}
        keyExtractor={(applicant) => applicant.id}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => <ApplicantRow applicant={item} onPress={() => router.push(`/applicants/${item.id}`)} showStage={stage === null} />}
        testID="applicants-list"
      />
      <OptionSheet
        isOpen={isStageSheetOpen}
        onClose={() => setIsStageSheetOpen(false)}
        onSelect={(next) => {
          setIsStageSheetOpen(false);
          onStageChange(next === ALL_STAGES_OPTION ? null : (next as ApplicantStage));
        }}
        options={STAGE_OPTIONS}
        title="Show which stage?"
        value={stage ?? ALL_STAGES_OPTION}
      />
    </View>
  );
}
