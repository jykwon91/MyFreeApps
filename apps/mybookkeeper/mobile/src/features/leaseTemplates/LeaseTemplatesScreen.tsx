import { useLeaseTemplatesPages } from "@mybookkeeper/api-client/hooks/useLeaseTemplatesPages";
import { EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseTemplateRow from "./LeaseTemplateRow";
import LeaseTemplatesSkeleton, { LeaseTemplateSkeletonRow } from "./LeaseTemplatesSkeleton";

export default function LeaseTemplatesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const list = useLeaseTemplatesPages();
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.templates : [];
  const addTemplate = () => router.push("/lease-templates/new");

  const emptyList = !isCurrent && list.isFetching ? (
    <LeaseTemplatesSkeleton />
  ) : list.error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : (
    <EmptyState
      action={canWrite ? { label: MESSAGES.add, onPress: addTemplate } : undefined}
      body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
      heading={MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        <View style={{ gap: spacing.md, padding: rows.length > 0 ? spacing.lg : 0 }}>
          <PagedListFooter
            isLoadingMore={list.isFetchingNextPage}
            loadMoreFailed={list.isLoadMoreError}
            loadingLabel={MESSAGES.loadingMore}
            onRetry={list.loadMore}
            skeletonRow={<LeaseTemplateSkeletonRow />}
          />
          {canWrite && rows.length > 0 ? <LoadingButton onPress={addTemplate}>{MESSAGES.add}</LoadingButton> : null}
        </View>
      }
      ListHeaderComponent={<StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} style={{ margin: spacing.lg }} />}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(template) => template.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => <LeaseTemplateRow onPress={() => router.push(`/lease-templates/${item.id}`)} template={item} />}
      testID="lease-templates-list"
    />
  );
}
