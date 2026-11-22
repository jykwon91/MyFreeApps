import { INQUIRY_STAGES } from "@mybookkeeper/api-client/constants/inquiryLabels";
import { useInquiriesPages } from "@mybookkeeper/api-client/hooks/useInquiriesPages";
import { useGetIntegrationsQuery } from "@mybookkeeper/api-client/store/integrationsApi";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import { ClampedText, EmptyState, LoadingButton, OptionSheet, SegmentedControl, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { ALL_STAGES_OPTION, INQUIRY_EMPTY_GMAIL_VIEW_ONLY_BODY, INQUIRY_EMPTY_GMAIL_WORDS, INQUIRY_EMPTY_WORDS, INQUIRY_LOADING_MESSAGES, INQUIRY_VIEWS, InquiryViewMode } from "../../constants/inquiries";
import { INQUIRY_CREATE_MESSAGES } from "../../constants/inquiryCreate";
import { INTEGRATIONS_LINK } from "../../constants/home";
import { REPLY_TEMPLATES_LINK } from "../../constants/replyTemplates";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import type { InquiryView } from "../../types/InquiryView";
import { gmailConnection, gmailIntegration } from "../integrations/gmailConnection";
import PagedListFooter from "../shell/PagedListFooter";
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

  const args = useMemo(() => toPageArgs(view, stage), [view, stage]);
  const list = useInquiriesPages(args);
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);

  const { currentData: integrations } = useGetIntegrationsQuery();
  const connection = gmailConnection(gmailIntegration(integrations));

  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.inquiries : [];

  function emptyList(): ReactElement {
    if (!isCurrent && list.isFetching) return <InquiriesSkeleton />;
    if (list.error) return <EmptyState action={{ label: "Try again", onPress: refresh }} body="Want me to try again?" heading="I couldn't load your inquiries." />;
    if (stage) {
      return <EmptyState action={{ label: "Clear filter", onPress: () => onStageChange(null) }} body="No inquiries are at that stage here." heading="Nothing matches that" />;
    }
    const inboxIsEmpty = view === InquiryViewMode.INBOX || view === InquiryViewMode.ALL;
    if (inboxIsEmpty && integrations && connection !== "connected") {
      if (!canWrite) return <EmptyState body={INQUIRY_EMPTY_GMAIL_VIEW_ONLY_BODY} heading={INQUIRY_EMPTY_WORDS[view].heading} />;
      const words = INQUIRY_EMPTY_GMAIL_WORDS[connection];
      return (
        <EmptyState
          action={{ label: words.action, onPress: () => router.push(INTEGRATIONS_LINK) }}
          body={words.body}
          heading={INQUIRY_EMPTY_WORDS[view].heading}
        />
      );
    }
    return <EmptyState body={INQUIRY_EMPTY_WORDS[view].body} heading={INQUIRY_EMPTY_WORDS[view].heading} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={list.isLoading ? <InquiriesSkeleton /> : emptyList()}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={INQUIRY_LOADING_MESSAGES.more}
            onRetry={list.loadMore}
            skeletonRow={<InquirySkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
            {canWrite ? (
              <LoadingButton accessibilityHint={INQUIRY_CREATE_MESSAGES.addHint} onPress={() => setIsAdding(true)}>
                {INQUIRY_CREATE_MESSAGES.addInquiry}
              </LoadingButton>
            ) : null}
            <LoadingButton accessibilityHint={INQUIRY_CREATE_MESSAGES.templatesHint} accessibilityLabel={INQUIRY_CREATE_MESSAGES.templates} onPress={() => router.push(REPLY_TEMPLATES_LINK)} variant="secondary">
              {INQUIRY_CREATE_MESSAGES.templates}
            </LoadingButton>
            <SegmentedControl accessibilityLabel="Which inquiries to show" onChange={onViewChange} segments={INQUIRY_VIEWS} value={view} />
            <LoadingButton onPress={() => setIsStageSheetOpen(true)} variant="secondary">
              {`Stage: ${stage ? stageLabel(stage) : "All"}`}
            </LoadingButton>
            {stage ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <ClampedText numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>
                  {stageLabel(stage)}
                </ClampedText>
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
          if (canLoadMore(list)) list.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <InquiryRow
            inquiry={item}
            listingTitle={item.listing_title}
            onPress={() => router.push(`/inquiries/${item.id}`)}
            showSpam={view === InquiryViewMode.ALL}
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
