import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useListTransactionsQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { DRILL_DOWN_TRUNCATED_MESSAGE } from "@mybookkeeper/api-client/constants/transactionPaging";
import { drillDownListParams, drillDownTotal, filterDrillDownTransactions, isDrillDownTruncated } from "@mybookkeeper/api-client/utils/drillDown";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { FlatList, Text, View } from "react-native";
import { DRILL_DOWN_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { DrillDownParams } from "../../types/DrillDownParams";
import TransactionRow from "../transactions/TransactionRow";
import TransactionsSkeleton from "../transactions/TransactionsSkeleton";
import { propertyLabel, spokenMoney } from "../transactions/transactionDisplay";
import { drillDownFilterFromParams } from "./drillDownLink";

/** The approved transactions a number on the analytics screen was added up from. */
export default function DrillDownScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const params = useLocalSearchParams<Partial<DrillDownParams>>();
  const filter = useMemo(() => drillDownFilterFromParams(params), [params]);
  const query = useMemo(() => drillDownListParams(filter), [filter]);
  const { currentData, error, isFetching, refetch } = useListTransactionsQuery(query);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const transactions = useMemo(() => (currentData ? filterDrillDownTransactions(currentData, filter) : []), [currentData, filter]);
  const total = drillDownTotal(transactions);

  const emptyList = currentData ? (
    <EmptyState body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  ) : isFetching ? (
    <TransactionsSkeleton />
  ) : (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListHeaderComponent={
        <View style={{ gap: spacing.xs, padding: spacing.lg }}>
          {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
          <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {filter.label}
          </Text>
          {currentData ? (
            <Text accessibilityLabel={`${MESSAGES.count(transactions.length)}, ${spokenMoney(total)}`} style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
              {MESSAGES.count(transactions.length)} · {formatCurrency(total)}
            </Text>
          ) : null}
          {currentData && isDrillDownTruncated(currentData) ? <Banner message={DRILL_DOWN_TRUNCATED_MESSAGE} /> : null}
        </View>
      }
      contentInsetAdjustmentBehavior="automatic"
      data={transactions}
      keyExtractor={(transaction) => transaction.id}
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
