import type { SummaryResponse } from "@mybookkeeper/api-client/types/summary/summary";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { formatCurrency } from "@platform/core/utils/currency";
import type { HomePeriod } from "../../constants/home";
import { moneySign, signedMoney, spokenSignedMoney } from "../transactions/transactionDisplay";
import { periodLabel } from "./homeDisplay";

export default function NumbersCard({ summary, period }: { summary: SummaryResponse; period: HomePeriod }) {
  const { colors, spacing, fontSize } = useTheme();
  const isLoss = moneySign(summary.profit) < 0;
  return (
    <View
      accessibilityLabel={`${periodLabel(period)}: net ${spokenSignedMoney(summary.profit)}, income ${spokenSignedMoney(summary.revenue)}, expenses ${spokenSignedMoney(summary.expenses)}.${isLoss ? " You spent more than you earned." : ""} Approved transactions only.`}
      accessible
      style={{ gap: spacing.sm }}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>Net</Text>
      <Text
        style={{
          fontSize: fontSize.xl,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
          color: moneySign(summary.profit) > 0 ? colors.positiveText : colors.foreground,
        }}
      >
        {signedMoney(summary.profit)}
      </Text>
      {isLoss ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>You spent more than you earned.</Text> : null}
      <View style={{ flexDirection: "row", gap: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>Income</Text>
          <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: colors.foreground }}>{formatCurrency(summary.revenue)}</Text>
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>Expenses</Text>
          <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: colors.foreground }}>{formatCurrency(summary.expenses)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>Approved transactions only.</Text>
    </View>
  );
}
