import type { PropertyPnLResponse } from "@mybookkeeper/api-client/types/attribution/property-pnl-response";
import { formatCurrency } from "@platform/core/utils/currency";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import { moneySign, signedMoney } from "../transactions/transactionDisplay";
import { centsToDollars, totalsLabel } from "./propertyPnlDisplay";

export default function PropertyPnlTotals({ totals, dates }: { totals: PropertyPnLResponse; dates: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const net = centsToDollars(totals.total_net_cents);
  return (
    <View
      accessible
      accessibilityLabel={totalsLabel(totals.total_revenue_cents, totals.total_expenses_cents, totals.total_net_cents, dates)}
      style={{ gap: spacing.xs }}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.net}</Text>
      <Text style={{ fontSize: fontSize.xl, fontWeight: "700", fontVariant: ["tabular-nums"], color: moneySign(net) < 0 ? colors.destructiveText : colors.positiveText }}>
        {signedMoney(net)}
      </Text>
      <View style={{ flexDirection: "row", gap: spacing.lg }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.revenue} {formatCurrency(centsToDollars(totals.total_revenue_cents))}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.expenses} {formatCurrency(centsToDollars(totals.total_expenses_cents))}
        </Text>
      </View>
    </View>
  );
}
