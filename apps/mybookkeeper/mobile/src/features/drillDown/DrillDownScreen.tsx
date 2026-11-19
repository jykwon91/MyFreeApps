import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useDrillDownPages } from "@mybookkeeper/api-client/hooks/useDrillDownPages";
import { StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { DRILL_DOWN_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import type { DrillDownParams } from "../../types/DrillDownParams";
import PagedListFooter from "../shell/PagedListFooter";
import TransactionRow from "../transactions/TransactionRow";
import { TransactionSkeletonRow } from "../transactions/TransactionsSkeleton";
import { propertyLabel } from "../transactions/transactionDisplay";
import DrillDownEmptyList from "./DrillDownEmptyList";
import DrillDownHeadline from "./DrillDownHeadline";
import { drillDownFilterFromParams } from "./drillDownLink";

/** The approved transactions a number on the analytics screen was added up from, a page at a time, with the server's count and total. */
export default function DrillDownScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const params = useLocalSearchParams<Partial<DrillDownParams>>();
  const filter = useMemo(() => drillDownFilterFromParams(params), [params]);
  const list = useDrillDownPages(filter);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.transactions : [];

  return (
    <FlatList
      ListEmptyComponent={<DrillDownEmptyList isEmpty={isCurrent && list.total === 0} isFetching={list.isFetching} onRetry={refresh} />}
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={list.isFetchingNextPage}
          loadMoreFailed={list.isLoadMoreError}
          loadingLabel={MESSAGES.loadingMore}
          onRetry={list.loadMore}
          skeletonRow={<TransactionSkeletonRow />}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.xs, padding: spacing.lg }}>
          <StaleDataBanner isShown={Boolean(list.error) && isCurrent && !list.isLoadMoreError} />
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {filter.label}
          </Text>
          <DrillDownHeadline amountTotal={list.amountTotal} count={list.total} isShown={isCurrent} />
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(transaction) => transaction.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <TransactionRow
          onPress={() => router.push(`/transactions/${item.id}`)}
          propertyName={item.property_id ? propertyLabel(item.property_id, properties) : null}
          transaction={item}
        />
      )}
      testID="drill-down-list"
    />
  );
}
