import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import type { TaxCategoryRow } from "../../types/TaxCategoryRow";
import { spokenMoney } from "../transactions/transactionDisplay";

export default function TaxCategoryRowView({ row }: { row: TaxCategoryRow }) {
  const { colors, spacing, fontSize } = useTheme();
  const dollars = row.cents / 100;
  return (
    <View
      accessible
      accessibilityLabel={`${row.label}, ${spokenMoney(dollars)}${row.note ? `, ${row.note}` : ""}`}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{row.label}</Text>
        {row.note ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{row.note}</Text> : null}
      </View>
      <Text style={{ fontSize: fontSize.md, color: colors.foreground, textAlign: "right" }}>{formatCurrency(dollars)}</Text>
    </View>
  );
}
