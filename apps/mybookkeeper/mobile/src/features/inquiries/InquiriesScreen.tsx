import { INQUIRY_STAGES } from "@mybookkeeper/api-client/constants/inquiryLabels";
import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useListInquiryPagesInfiniteQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import { Banner, EmptyState, LoadingButton, OptionSheet, SHOWING_LAST_LOADED_MESSAGE, SegmentedControl, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { ALL_STAGES_OPTION, INQUIRY_EMPTY_WORDS, INQUIRY_VIEWS } from "../../constants/inquiries";
import { INQUIRY_CREATE_MESSAGES, INQUIRY_LISTING_CHOICE_LIMIT } from "../../constants/inquiryCreate";
import { uniqueById } from "../../lib/uniqueById";
import type { InquiryView } from "../../types/InquiryView";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { useCanWrite } from "../workspace/useCanWrite";
import InquiriesSkeleton, { InquirySkeletonRow } from "./InquiriesSkeleton";
import { stageLabel } from "./inquiryDisplay";
import { toPageArgs } from "./inquiryFilters";
import InquiryRow from "./InquiryRow";
import NewInquirySheet from "./NewInquirySheet";

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
  const canWrite = useCanWrite();
  const [isStageSheetOpen, setIsStageSheetOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
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

  const { currentData: listingsData } = useGetListingsQuery({ limit: INQUIRY_LISTING_CHOICE_LIMIT });
  const listingTitleById = useMemo(
    () => new Map((listingsData?.items ?? []).map((listing) => [listing.id, listing.title])),
    [listingsData],
  );

  const rows = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);

  async function loadMore(): Promise<void> {
    const result = await fetchNextPage();
    setListThatFailedToLoadMore(result.isError ? listKey : null);
  }

  function emptyList(): ReactElement {
    if (!currentData && isFetching) return <InquiriesSkeleton />;
    if (error) return <EmptyState action={{ label: "Try again", onPress: refresh }} body="Want me to try again?" heading="I couldn't load your inquiries." />;
    if (stage) {
      return <EmptyState action={{ label: "Clear filter", onPress: () => onStageChange(null) }} body="No inquiries are at that stage here." heading="Nothing matches that" />;
    }
    return <EmptyState body={INQUIRY_EMPTY_WORDS[view].body} heading={INQUIRY_EMPTY_WORDS[view].heading} />;
  }

  function footer(): ReactElement | undefined {
    if (isFetchingNextPage) return <InquirySkeletonRow />;
    if (loadMoreFailed) return <LoadMoreFailed onRetry={() => void loadMore()} />;
    return undefined;
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={isLoading ? <InquiriesSkeleton /> : emptyList()}
        ListFooterComponent={footer()}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {canWrite ? (
              <LoadingButton accessibilityHint={INQUIRY_CREATE_MESSAGES.addHint} onPress={() => setIsAdding(true)}>
                {INQUIRY_CREATE_MESSAGES.addInquiry}
              </LoadingButton>
            ) : null}
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
            listingTitle={item.listing_id ? (listingTitleById.get(item.listing_id) ?? null) : null}
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
      {isAdding ? <NewInquirySheet onClose={() => setIsAdding(false)} onCreated={(inquiry) => router.push(`/inquiries/${inquiry.id}`)} /> : null}
    </View>
  );
}
