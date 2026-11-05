import { useListTaxReturnsQuery } from "@mybookkeeper/api-client/store/taxReturnsApi";
import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { useCanWrite } from "../workspace/useCanWrite";
import { byYearNewestFirst } from "./taxReturnDisplay";
import TaxReturnRow from "./TaxReturnRow";
import TaxReturnsSkeleton from "./TaxReturnsSkeleton";

export default function TaxReturnsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useListTaxReturnsQuery();
  const { refresh, refreshControl } = useRefresh(refetch, error);
  const returns = useMemo(() => byYearNewestFirst(currentData ?? []), [currentData]);

  function emptyList() {
    if (currentData) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.addDocument, onPress: () => router.push("/camera") } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={MESSAGES.noneHeading}
        />
      );
    }
    if (isFetching) return <TaxReturnsSkeleton label={MESSAGES.loading} testID="tax-returns-skeleton" />;
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh }}
        body={isServerAnswer(error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
        heading={MESSAGES.couldntLoad}
      />
    );
  }

  return (
    <FlatList<TaxReturn>
      ListEmptyComponent={emptyList()}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.note}</Text>
          {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={returns}
      keyExtractor={(taxReturn) => taxReturn.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <TaxReturnRow onPress={() => router.push(`/tax-returns/${item.id}`)} taxReturn={item} />}
      testID="tax-returns-list"
    />
  );
}
