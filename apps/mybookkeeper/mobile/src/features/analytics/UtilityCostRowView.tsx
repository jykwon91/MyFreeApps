import { useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import type { UtilityCostRow } from "../../types/UtilityCostRow";
import { spokenMoney } from "../transactions/transactionDisplay";
import UtilityCostBar from "./UtilityCostBar";
import { barPercent } from "./utilityCostsDisplay";

export default function UtilityCostRowView({ row, totalCents }: { row: UtilityCostRow; totalCents: number }) {
  const { colors, spacing, fontSize } = useTheme();
  const dollars = row.cents / 100;
  return (
    <View accessible accessibilityLabel={`${row.label}, ${spokenMoney(dollars)}`} style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <Text style={{ flexShrink: 1, fontSize: fontSize.md, color: colors.foreground }}>{row.label}</Text>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{formatCurrency(dollars)}</Text>
      </View>
      <UtilityCostBar percent={barPercent(row.cents, totalCents)} />
    </View>
  );
}
