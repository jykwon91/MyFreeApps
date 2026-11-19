import { useWelcomeManualsPages } from "@mybookkeeper/api-client/hooks/useWelcomeManualsPages";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import PagedListFooter from "../shell/PagedListFooter";
import { useCanWrite } from "../workspace/useCanWrite";
import { manualPropertyName } from "./welcomeManualDisplay";
import WelcomeManualRow from "./WelcomeManualRow";
import WelcomeManualsSkeleton, { WelcomeManualSkeletonRow } from "./WelcomeManualsSkeleton";

export default function WelcomeManualsScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const list = useWelcomeManualsPages();
  const { currentData: properties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(list.refetch, list.error);
  const isCurrent = hasCurrentPages(list);
  const rows = isCurrent ? list.manuals : [];
  const addManual = () => router.push("/welcome-manuals/new");

  const emptyList = !isCurrent && list.isFetching ? (
    <WelcomeManualsSkeleton />
  ) : list.error ? (
    <EmptyState
      action={{ label: WELCOME_MANUAL_MESSAGES.tryAgain, onPress: refresh }}
      body={WELCOME_MANUAL_MESSAGES.tryAgainOffer}
      heading={WELCOME_MANUAL_MESSAGES.couldntLoadList}
    />
  ) : (
    <EmptyState
      action={canWrite ? { label: WELCOME_MANUAL_MESSAGES.new, onPress: addManual } : undefined}
      body={canWrite ? WELCOME_MANUAL_MESSAGES.noneBody : WELCOME_MANUAL_MESSAGES.noneViewOnlyBody}
      heading={WELCOME_MANUAL_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        <PagedListFooter
          isLoadingMore={list.isFetchingNextPage}
          loadMoreFailed={list.isLoadMoreError}
          loadingLabel={WELCOME_MANUAL_MESSAGES.loadingMore}
          onRetry={list.loadMore}
          skeletonRow={<WelcomeManualSkeletonRow />}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <StaleDataBanner isShown={Boolean(list.error && rows.length > 0 && !list.isLoadMoreError)} />
          {canWrite && rows.length > 0 ? <LoadingButton onPress={addManual}>{WELCOME_MANUAL_MESSAGES.new}</LoadingButton> : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(manual) => manual.id}
      onEndReached={() => {
        if (canLoadMore(list)) list.loadMore();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <WelcomeManualRow
          manual={item}
          onPress={() => router.push(`/welcome-manuals/${item.id}`)}
          propertyName={manualPropertyName(item.property_id, properties)}
        />
      )}
      testID="welcome-manuals-list"
    />
  );
}
