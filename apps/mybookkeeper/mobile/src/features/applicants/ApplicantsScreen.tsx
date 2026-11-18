import { APPLICANT_STAGES } from "@mybookkeeper/api-client/constants/applicantLabels";
import { useApplicantsPages } from "@mybookkeeper/api-client/hooks/useApplicantsPages";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { EmptyState, LoadingButton, OptionSheet, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { APPLICANT_EMPTY_BODY, APPLICANT_LOADING_MESSAGES } from "../../constants/applicants";
import { ALL_STAGES_OPTION } from "../../constants/inquiries";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import PagedListFooter from "../shell/PagedListFooter";
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

  const args = useMemo(() => (stage ? { stage } : {}), [stage]);
  const list = useApplicantsPages(args);
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.applicants : [];

  const emptyList = !isCurrent && list.isFetching ? (
    <ApplicantsSkeleton />
  ) : list.error ? (
    <EmptyState action={{ label: "Try again", onPress: refresh }} body="Want me to try again?" heading="I couldn't load your applicants." />
  ) : stage ? (
    <EmptyState action={{ label: "Clear filter", onPress: () => onStageChange(null) }} body="No applicants are at that stage." heading="Nothing matches that" />
  ) : (
    <EmptyState
      action={{ label: "See inquiries", onPress: onSeeInquiries }}
      body={APPLICANT_EMPTY_BODY}
      heading="No applicants yet"
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={APPLICANT_LOADING_MESSAGES.more}
            onRetry={list.loadMore}
            skeletonRow={<ApplicantSkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
            <LoadingButton onPress={() => setIsStageSheetOpen(true)} variant="secondary">
              {`Stage: ${stage ? applicantStageLabel(stage) : "All"}`}
            </LoadingButton>
          </View>
        }
        data={rows}
        keyExtractor={(applicant) => applicant.id}
        onEndReached={() => {
          if (canLoadMore(list)) list.loadMore();
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
