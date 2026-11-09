import { formatCurrency } from "@platform/core/utils/currency";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_REPORT_MESSAGES as MESSAGES } from "../../constants/taxReport";
import type { TaxW2Row } from "../../types/TaxW2Row";
import { spokenMoney } from "../transactions/transactionDisplay";

export default function TaxW2RowView({ row }: { row: TaxW2Row }) {
  const { colors, spacing, fontSize } = useTheme();
  const federal = row.federalWithheldCents / 100;
  const state = row.stateWithheldCents / 100;
  const withheld = MESSAGES.withheld(formatCurrency(federal), formatCurrency(state));
  return (
    <View
      accessible
      accessibilityLabel={`${row.employer}, ${MESSAGES.wages} ${spokenMoney(row.wagesCents / 100)}. ${MESSAGES.withheld(spokenMoney(federal), spokenMoney(state))}`}
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
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{row.employer}</Text>
        {row.ein ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.ein(row.ein)}</Text> : null}
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{withheld}</Text>
      </View>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground, textAlign: "right" }}>{formatCurrency(row.wagesCents / 100)}</Text>
    </View>
  );
}
