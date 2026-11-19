import { useMortgagesPages } from "@mybookkeeper/api-client/hooks/useMortgagesPages";
import { EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, View } from "react-native";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import { sortedMortgages } from "./mortgageDisplay";
import MortgageRow from "./MortgageRow";
import MortgageSkeletonRow from "./MortgageSkeletonRow";
import MortgagesSkeleton from "./MortgagesSkeleton";

export default function MortgagesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const list = useMortgagesPages();
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = useMemo(() => sortedMortgages(isCurrent ? list.mortgages : []), [isCurrent, list.mortgages]);
  const addOne = () => router.push("/mortgages/new");

  const emptyList = !isCurrent && list.isFetching ? (
    <MortgagesSkeleton />
  ) : list.error ? (
    <EmptyState
      action={{ label: MORTGAGE_MESSAGES.tryAgain, onPress: refresh }}
      body={MORTGAGE_MESSAGES.tryAgainOffer}
      heading={MORTGAGE_MESSAGES.couldntLoadList}
    />
  ) : (
    <EmptyState
      action={canWrite ? { label: MORTGAGE_MESSAGES.addFirst, onPress: addOne } : undefined}
      body={canWrite ? MORTGAGE_MESSAGES.noneBody : MORTGAGE_MESSAGES.noneBodyViewer}
      heading={MORTGAGE_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={list.isFetchingNextPage}
          loadMoreFailed={list.isLoadMoreError}
          loadingLabel={MORTGAGE_MESSAGES.loadingMore}
          onRetry={list.loadMore}
          skeletonRow={<MortgageSkeletonRow />}
        />
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(list.error && !list.isLoadMoreError)} />
            {canWrite ? (
              <LoadingButton onPress={addOne} variant="secondary">
                {MORTGAGE_MESSAGES.add}
              </LoadingButton>
            ) : null}
            <LoadingButton onPress={() => router.push("/mortgages/rates")} variant="secondary">
              {MORTGAGE_MESSAGES.checkRates}
            </LoadingButton>
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(mortgage) => mortgage.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => <MortgageRow mortgage={item} onPress={() => router.push(`/mortgages/${item.id}`)} />}
      testID="mortgages-list"
    />
  );
}
