import { useGetMortgagesQuery } from "@mybookkeeper/api-client/store/mortgagesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { MORTGAGE_LIST_LIMIT, MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useOpenLink } from "../inquiries/useOpenLink";
import { sortedMortgages } from "./mortgageDisplay";
import MortgageRow from "./MortgageRow";
import MortgagesSkeleton from "./MortgagesSkeleton";

export default function MortgagesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData, error, isFetching, refetch } = useGetMortgagesQuery({ limit: MORTGAGE_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = useMemo(() => sortedMortgages(currentData?.items ?? []), [currentData]);
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/mortgages`);

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
      action={{ label: MORTGAGE_MESSAGES.openWebsite, onPress: openWebsite }}
      body={MORTGAGE_MESSAGES.noneBody}
      heading={MORTGAGE_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {currentData?.has_more ? MORTGAGE_MESSAGES.moreOnWebsite : MORTGAGE_MESSAGES.manageOnWebsite}
            </Text>
            <LoadingButton onPress={openWebsite} variant="ghost">
              {MORTGAGE_MESSAGES.openWebsite}
            </LoadingButton>
          </View>
        ) : undefined
      }
      ListHeaderComponent={
        error && rows.length > 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Banner message={SHOWING_LAST_LOADED_MESSAGE} />
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
