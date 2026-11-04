import { INQUIRY_STAGES } from "@mybookkeeper/api-client/constants/inquiryLabels";
import { useListInquiryPagesInfiniteQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import { Banner, EmptyState, LoadingButton, OptionSheet, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { ALL_STAGES_OPTION, INQUIRY_EMPTY_WORDS, INQUIRY_VIEWS } from "../../constants/inquiries";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { InquiryView } from "../../types/InquiryView";
import InquiriesSkeleton, { InquirySkeletonRow } from "./InquiriesSkeleton";
import { stageLabel } from "./inquiryDisplay";
import { toPageArgs } from "./inquiryFilters";
import InquiryRow from "./InquiryRow";

const STAGE_OPTIONS = [
  { value: ALL_STAGES_OPTION, label: "All" },
  ...INQUIRY_STAGES.map((stage) => ({ value: stage as string, label: stageLabel(stage) })),
];

export default function InquiriesScreen({
  view,
  stage,
  onViewChange,
  onStageChange,
}: {
  view: InquiryView;
  stage: InquiryStage | null;
  onViewChange: (view: InquiryView) => void;
  onStageChange: (stage: InquiryStage | null) => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const [isStageSheetOpen, setIsStageSheetOpen] = useState(false);
  const [listThatFailedToLoadMore, setListThatFailedToLoadMore] = useState<string | null>(null);

  const args = useMemo(() => toPageArgs(view, stage), [view, stage]);
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isLoading, refetch } =
    useListInquiryPagesInfiniteQuery(args);
  const listKey = JSON.stringify(args);
  const loadMoreFailed = listThatFailedToLoadMore === listKey;
  const { refresh, refreshControl } = useRefresh(async () => {
    setListThatFailedToLoadMore(null);
    await refetch();
  }, error);

  // A new inquiry arriving between pages moves the rest down, so a row can come back twice.
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const unique: InquirySummary[] = [];
    for (const inquiry of currentData?.pages.flatMap((page) => page.items) ?? []) {
      if (!seen.has(inquiry.id)) {
        seen.add(inquiry.id);
        unique.push(inquiry);
      }
    }
    return unique;
  }, [currentData]);

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  const emptyList = isFetching ? (
    <InquiriesSkeleton />
  ) : error ? (
    <EmptyState action={{ label: "Try again", onPress: refresh }} body="Want me to try again?" heading="I couldn't load your inquiries." />
  ) : stage ? (
    <EmptyState action={{ label: "Clear filter", onPress: () => onStageChange(null) }} body="No inquiries are at that stage here." heading="Nothing matches that" />
  ) : (
    <EmptyState body={INQUIRY_EMPTY_WORDS[view].body} heading={INQUIRY_EMPTY_WORDS[view].heading} />
  );

  const footer = isFetchingNextPage ? (
    <InquirySkeletonRow />
  ) : loadMoreFailed ? (
    <View style={{ gap: spacing.sm, padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>I couldn't load more.</Text>
      <LoadingButton onPress={loadMore} variant="secondary">
        Try again
      </LoadingButton>
    </View>
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={isLoading ? <InquiriesSkeleton /> : emptyList}
        ListFooterComponent={footer}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <SegmentedControl accessibilityLabel="Which inquiries to show" onChange={onViewChange} segments={INQUIRY_VIEWS} value={view} />
            <LoadingButton onPress={() => setIsStageSheetOpen(true)} variant="secondary">
              {`Stage: ${stage ? stageLabel(stage) : "All"}`}
            </LoadingButton>
            {stage ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>
                  {stageLabel(stage)}
                </Text>
                <LoadingButton onPress={() => onStageChange(null)} variant="ghost">
                  Clear
                </LoadingButton>
              </View>
            ) : null}
          </View>
        }
        data={rows}
        keyExtractor={(inquiry) => inquiry.id}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <InquiryRow
            inquiry={item}
            onPress={() => router.push(`/inquiries/${item.id}`)}
            showSpam={view === "all"}
            showStage={stage === null}
          />
        )}
        testID="inquiries-list"
      />
      <OptionSheet
        isOpen={isStageSheetOpen}
        onClose={() => setIsStageSheetOpen(false)}
        onSelect={(next) => {
          setIsStageSheetOpen(false);
          onStageChange(next === ALL_STAGES_OPTION ? null : (next as InquiryStage));
        }}
        options={STAGE_OPTIONS}
        title="Show which stage?"
        value={stage ?? ALL_STAGES_OPTION}
      />
    </View>
  );
}
