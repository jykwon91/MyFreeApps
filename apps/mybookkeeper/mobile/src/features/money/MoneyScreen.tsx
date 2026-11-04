import { SegmentedControl, useTheme } from "@platform/mobile";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { MONEY_SEGMENTS, type MoneySegment } from "../../constants/moneySegments";
import type { MoneyParams } from "../../types/MoneyParams";
import DocumentsScreen from "../documents/DocumentsScreen";
import { filtersFromParams, filtersToParams } from "../transactions/transactionFilters";
import TransactionsScreen from "../transactions/TransactionsScreen";

export default function MoneyScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<MoneyParams>();
  const segment: MoneySegment = params.segment === "documents" ? "documents" : "transactions";
  const filters = useMemo(() => filtersFromParams(params), [params]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SegmentedControl
          accessibilityLabel="Money"
          onChange={(next) => router.setParams({ segment: next })}
          segments={MONEY_SEGMENTS}
          value={segment}
        />
      </View>
      <View style={{ flex: 1 }}>
        {segment === "documents" ? (
          <DocumentsScreen
            filter={params.filter === "needsALook" ? "needsALook" : "all"}
            onFilterChange={(filter) => router.setParams({ filter })}
          />
        ) : (
          <TransactionsScreen
            filters={filters}
            onFiltersChange={(next) => router.setParams(filtersToParams(next))}
            onVendorChange={(vendor) => router.setParams({ vendor })}
          />
        )}
      </View>
    </View>
  );
}
