import { useApplicationsPages } from "@myjobhunter/api-client/hooks/useApplicationsPages";
import { EmptyState, OptionSheet, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { APPLICATION_SORT_OPTIONS, APPLICATION_SORTS, DEFAULT_APPLICATION_SORT } from "../../constants/applicationSorts";
import { APPLICATION_MESSAGES as MESSAGES, LOAD_MORE_THRESHOLD } from "../../constants/applications";
import type { ApplicationSortKey } from "../../types/ApplicationSortKey";
import ApplicationRow from "./ApplicationRow";
import ApplicationsListFooter from "./ApplicationsListFooter";
import ApplicationsListHeader from "./ApplicationsListHeader";
import ApplicationsSkeleton from "./ApplicationsSkeleton";

export default function ApplicationsScreen() {
  const [sortKey, setSortKey] = useState<ApplicationSortKey>(DEFAULT_APPLICATION_SORT);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const sort = APPLICATION_SORTS[sortKey];
  // Sorted on the server, a page at a time, so the order holds however far down the list goes.
  const list = useApplicationsPages({ sort: sort.field, order: sort.direction });
  const { isRefreshing, refresh, refreshControl } = useRefresh(list.refetch, list.error);
  // A new sort starts over from its first page; the old sort's rows would be in the wrong order.
  const isLoadingList = list.isLoading || list.isSorting;
  const rows = isLoadingList ? [] : list.applications;
  const hasLoaded = !isLoadingList && list.loadError === undefined;

  const addApplication = () => router.push("/applications/new");

  const loadMore = () => {
    // After a failed page, wait for Try again rather than retrying on every scroll.
    if (list.hasNextPage && !list.isFetchingNextPage && !list.isLoadMoreError) list.loadMore();
  };

  // Once anything has loaded, a failed refresh keeps it on screen (even an empty list) under a banner.
  const emptyList = isLoadingList ? (
    <ApplicationsSkeleton />
  ) : !hasLoaded ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : (
    <EmptyState action={{ label: MESSAGES.add, onPress: addApplication }} body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <ApplicationsListFooter isLoadMoreError={list.isLoadMoreError} isLoadingMore={list.isFetchingNextPage} onRetry={list.loadMore} />
        }
        ListHeaderComponent={
          hasLoaded && (list.error || rows.length > 0) ? (
            <ApplicationsListHeader
              hasRows={rows.length > 0}
              isStale={Boolean(list.error) && !list.isLoadMoreError}
              onAdd={addApplication}
              onSort={() => setIsSortSheetOpen(true)}
              sortLabel={sort.label}
            />
          ) : undefined
        }
        data={rows}
        keyExtractor={(application) => application.id}
        onEndReached={loadMore}
        onEndReachedThreshold={LOAD_MORE_THRESHOLD}
        refreshControl={refreshControl}
        renderItem={({ item }) => <ApplicationRow application={item} onPress={() => router.push(`/applications/${item.id}`)} />}
        testID="applications-list"
      />
      <OptionSheet
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        onSelect={(next) => {
          setIsSortSheetOpen(false);
          setSortKey(next);
        }}
        options={APPLICATION_SORT_OPTIONS}
        title={MESSAGES.sortTitle}
        value={sortKey}
      />
    </View>
  );
}
