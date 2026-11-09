import type { MonthSummary } from "@mybookkeeper/api-client/types/summary/MonthSummary";
import { formatCurrency } from "@platform/core/utils/currency";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisScope } from "../../types/AnalysisScope";
import { drillDownLink } from "../drillDown/drillDownLink";
import HomeLinkRow from "../home/HomeLinkRow";
import { monthName } from "../../lib/localDate";
import { categoryLabel, moneySign, signedMoney, spokenMoney, spokenSignedMoney } from "../transactions/transactionDisplay";
import type { CategoryTotal } from "../../types/CategoryTotal";
import { monthDrillDown } from "./moneyAnalysisDrillDowns";

interface MonthRowProps {
  month: MonthSummary;
  expenseRows: readonly CategoryTotal[];
  scope: AnalysisScope;
}

/** One month: its net, with revenue and expenses and the categories behind it a tap away. */
export default function MonthRow({ month, expenseRows, scope }: MonthRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const name = monthName(month.month, "long");
  const open = (what: "revenue" | "expenses" | { category: string }) => router.navigate(drillDownLink(monthDrillDown(month.month, what, scope)));

  return (
    <View>
      <Pressable
        accessibilityLabel={`${name}, net ${spokenSignedMoney(month.profit)}, revenue ${spokenMoney(month.revenue)}, expenses ${spokenMoney(month.expenses)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((value) => !value)}
        style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
      >
        <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{name}</Text>
        <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: moneySign(month.profit) > 0 ? colors.positiveText : colors.foreground }}>{signedMoney(month.profit)}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.lg, color: colors.mutedForeground }}>
          {isOpen ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {isOpen ? (
        <View style={{ paddingLeft: spacing.md }}>
          <HomeLinkRow accessibilityLabel={`${MESSAGES.revenue}, ${spokenMoney(month.revenue)}`} detail={formatCurrency(month.revenue)} label={MESSAGES.revenue} onPress={() => open("revenue")} />
          <HomeLinkRow accessibilityLabel={`${MESSAGES.expenses}, ${spokenMoney(month.expenses)}`} detail={formatCurrency(month.expenses)} label={MESSAGES.expenses} onPress={() => open("expenses")} />
          {expenseRows.map((row) => (
            <HomeLinkRow
              accessibilityLabel={`${categoryLabel(row.category)}, ${spokenMoney(row.amount)}`}
              detail={formatCurrency(row.amount)}
              key={row.category}
              label={categoryLabel(row.category)}
              onPress={() => open({ category: row.category })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
