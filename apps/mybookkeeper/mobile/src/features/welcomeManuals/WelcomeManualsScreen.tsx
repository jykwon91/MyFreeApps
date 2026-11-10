import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetWelcomeManualsQuery } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { WELCOME_MANUAL_PAGE_SIZE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import LoadMoreFailed from "../shell/LoadMoreFailed";
import { useCanWrite } from "../workspace/useCanWrite";
import { manualPropertyName } from "./welcomeManualDisplay";
import WelcomeManualRow from "./WelcomeManualRow";
import WelcomeManualsSkeleton from "./WelcomeManualsSkeleton";

export default function WelcomeManualsScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const [pageCount, setPageCount] = useState(1);
  const { data, currentData, error, isFetching, refetch } = useGetWelcomeManualsQuery({ limit: WELCOME_MANUAL_PAGE_SIZE * pageCount });
  const { currentData: properties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  // `data` keeps the rows already shown while a longer list loads; `currentData` would blank them.
  const rows = data?.items ?? [];
  const isLoadingMore = isFetching && pageCount > 1 && currentData === undefined;
  const loadMoreFailed = Boolean(error) && pageCount > 1 && rows.length > 0;
  const addManual = () => router.push("/welcome-manuals/new");

  const emptyList = !data && isFetching ? (
    <WelcomeManualsSkeleton />
  ) : error ? (
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

  const footer = loadMoreFailed ? (
    <LoadMoreFailed onRetry={() => void refetch()} />
  ) : data?.has_more ? (
    <View style={{ padding: spacing.lg }}>
      <LoadingButton isLoading={isLoadingMore} loadingText={WELCOME_MANUAL_MESSAGES.loadingMore} onPress={() => setPageCount((count) => count + 1)} variant="secondary">
        {WELCOME_MANUAL_MESSAGES.showMore}
      </LoadingButton>
    </View>
  ) : undefined;

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={footer}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          {error && rows.length > 0 && !loadMoreFailed ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          {canWrite && rows.length > 0 ? <LoadingButton onPress={addManual}>{WELCOME_MANUAL_MESSAGES.new}</LoadingButton> : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(manual) => manual.id}
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
