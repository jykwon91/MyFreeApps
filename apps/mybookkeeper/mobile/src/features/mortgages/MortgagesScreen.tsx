import { useGetMortgagesQuery } from "@mybookkeeper/api-client/store/mortgagesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { MORTGAGE_LIST_LIMIT, MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useCanWrite } from "../workspace/useCanWrite";
import { sortedMortgages } from "./mortgageDisplay";
import MortgageRow from "./MortgageRow";
import MortgagesSkeleton from "./MortgagesSkeleton";

export default function MortgagesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetMortgagesQuery({ limit: MORTGAGE_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = useMemo(() => sortedMortgages(currentData?.items ?? []), [currentData]);
  const addOne = () => router.push("/mortgages/new");

  const emptyList = !currentData && isFetching ? (
    <MortgagesSkeleton />
  ) : error ? (
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
        currentData?.has_more ? (
          <Text style={{ padding: spacing.lg, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MORTGAGE_MESSAGES.firstOnly}</Text>
        ) : undefined
      }
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
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
      refreshControl={refreshControl}
      renderItem={({ item }) => <MortgageRow mortgage={item} onPress={() => router.push(`/mortgages/${item.id}`)} />}
      testID="mortgages-list"
    />
  );
}
