import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import { TAX_REPORT_MESSAGES as MESSAGES } from "../../constants/taxReport";
import type { TaxPropertyRow } from "../../types/TaxPropertyRow";
import { spokenMoney, spokenSignedMoney } from "../transactions/transactionDisplay";

export default function TaxPropertyRowView({ row }: { row: TaxPropertyRow }) {
  const { colors, spacing, fontSize } = useTheme();
  const revenue = row.revenueCents / 100;
  const expenses = row.expensesCents / 100;
  const net = row.netCents / 100;
  return (
    <View
      accessible
      accessibilityLabel={`${row.name}, ${MESSAGES.netIncome} ${spokenSignedMoney(net)}, ${MESSAGES.revenue} ${spokenMoney(revenue)}, ${MESSAGES.deductions} ${spokenMoney(expenses)}`}
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
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{row.name}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.revenue} {formatCurrency(revenue)} · {MESSAGES.deductions} {formatCurrency(expenses)}
        </Text>
      </View>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground, textAlign: "right" }}>{formatCurrency(net)}</Text>
    </View>
  );
}
