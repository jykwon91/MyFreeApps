import { PROPERTY_PNL_CATEGORIES_SHOWN } from "@mybookkeeper/api-client/constants/propertyPnl";
import type { PropertyPnLEntry } from "@mybookkeeper/api-client/types/attribution/property-pnl-entry";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import { NO_FILTERS } from "../../constants/transactionFilters";
import { categoryLabel, moneySign, signedMoney } from "../transactions/transactionDisplay";
import { transactionsLink } from "../transactions/transactionFilters";
import { cardLabel, centsToDollars, moreCategoriesLine } from "./propertyPnlDisplay";
import { formatCurrency } from "@platform/core/utils/currency";

interface PropertyPnlCardProps {
  entry: PropertyPnLEntry;
  range: PropertyPnLRange;
}

/** The numbers are approved-only, so the transactions behind them are too. */
function transactionsBehind(entry: PropertyPnLEntry, range: PropertyPnLRange): string {
  return transactionsLink({ ...NO_FILTERS, period: "custom", startDate: range.since, endDate: range.until, propertyId: entry.property_id, approvedOnly: true });
}

export default function PropertyPnlCard({ entry, range }: PropertyPnlCardProps) {
  const { colors, spacing, fontSize } = useTheme();
  const net = centsToDollars(entry.net_cents);
  const shown = entry.expense_breakdown.slice(0, PROPERTY_PNL_CATEGORIES_SHOWN);
  const hidden = entry.expense_breakdown.length - shown.length;
  return (
    <Pressable
      accessibilityHint={MESSAGES.opensTransactions}
      accessibilityLabel={cardLabel(entry)}
      accessibilityRole="button"
      onPress={() => router.navigate(transactionsBehind(entry, range))}
      style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {entry.name}
        </Text>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: moneySign(net) < 0 ? colors.destructiveText : colors.positiveText }}>
          {signedMoney(net)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: spacing.lg }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.revenue} {formatCurrency(centsToDollars(entry.revenue_cents))}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.expenses} {formatCurrency(centsToDollars(entry.expenses_cents))}
        </Text>
      </View>
      {shown.map((item) => (
        <View key={item.category} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{categoryLabel(item.category)}</Text>
          <Text style={{ fontSize: fontSize.sm, fontVariant: ["tabular-nums"], color: colors.mutedForeground }}>{formatCurrency(centsToDollars(item.amount_cents))}</Text>
        </View>
      ))}
      {hidden > 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{moreCategoriesLine(hidden)}</Text> : null}
    </Pressable>
  );
}
