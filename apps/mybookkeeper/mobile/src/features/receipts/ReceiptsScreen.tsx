import { usePendingReceiptsPages } from "@mybookkeeper/api-client/hooks/usePendingReceiptsPages";
import { EmptyState, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { FlatList, Text, View } from "react-native";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import ReceiptGmailBanner from "./ReceiptGmailBanner";
import { receiptsWaitingLine } from "@mybookkeeper/api-client/utils/receiptsWaitingLine";
import ReceiptRow from "./ReceiptRow";
import ReceiptSkeletonRow from "./ReceiptSkeletonRow";
import ReceiptsSkeleton from "./ReceiptsSkeleton";

export default function ReceiptsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const list = usePendingReceiptsPages();
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.receipts : [];
  const { gmailState } = list;

  // A failed load, or rows cleared while more wait on the server, isn't caught up. A failed refresh keeps
  // the last answer but says so in the header.
  const isCaughtUp = isCurrent && list.total === 0;
  const emptyList = isCaughtUp ? (
    <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  ) : list.isFetching ? (
    <ReceiptsSkeleton />
  ) : (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={list.isFetchingNextPage}
          loadMoreFailed={list.isLoadMoreError}
          loadingLabel={MESSAGES.loadingMore}
          onRetry={list.loadMore}
          skeletonRow={<ReceiptSkeletonRow />}
        />
      }
      ListHeaderComponent={
        rows.length > 0 || (list.error && isCurrent) ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error) && !list.isLoadMoreError} />
            {rows.length > 0 ? (
              <>
                {canWrite ? <ReceiptGmailBanner state={gmailState} /> : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>}
                <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
                  {receiptsWaitingLine(list.total)}
                </Text>
              </>
            ) : null}
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(item) => item.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => <ReceiptRow canSend={gmailState === "ready"} canWrite={canWrite} receipt={item} />}
      testID="receipts-list"
    />
  );
}
