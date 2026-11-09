import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import type { PropertyMonthlySummary } from "@mybookkeeper/api-client/types/summary/PropertyMonthlySummary";
import type { PropertySummary } from "@mybookkeeper/api-client/types/summary/PropertySummary";
import { formatCurrency } from "@platform/core/utils/currency";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { monthName } from "../../lib/localDate";
import type { AnalysisScope } from "../../types/AnalysisScope";
import ChangeNote from "../analyticsControls/ChangeNote";
import { drillDownLink } from "../drillDown/drillDownLink";
import HomeLinkRow from "../home/HomeLinkRow";
import { moneySign, signedMoney, spokenMoney, spokenSignedMoney } from "../transactions/transactionDisplay";
import { monthsNewestFirst } from "./moneyAnalysisDisplay";
import { propertyDrillDown, propertyMonthDrillDown } from "./moneyAnalysisDrillDowns";

interface PropertyRowProps {
  property: PropertySummary;
  /** The same property in the stretch compared against; null when not comparing. A property with no figures then had none. */
  previous: PropertySummary | null;
  isComparing: boolean;
  monthly: PropertyMonthlySummary | undefined;
  againstLabel: string;
  scope: AnalysisScope;
}

/** One property: its profit and how it moved, opening into revenue, expenses and its months. */
export default function PropertyRow({ property, previous, isComparing, monthly, againstLabel, scope }: PropertyRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const name = property.name || MESSAGES.noProperty;
  const open = (kind?: "revenue" | "expenses") => {
    const filter = propertyDrillDown(property.property_id, name, scope);
    router.navigate(drillDownLink(kind ? { ...filter, type: kind } : filter));
  };

  return (
    <View>
      <Pressable
        accessibilityLabel={`${name}, net ${spokenSignedMoney(property.profit)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((value) => !value)}
        style={{ minHeight: MIN_TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.sm }}
      >
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{name}</Text>
        <Text style={{ fontSize: fontSize.md, fontVariant: ["tabular-nums"], color: moneySign(property.profit) > 0 ? colors.positiveText : colors.foreground }}>{signedMoney(property.profit)}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.lg, color: colors.mutedForeground }}>
          {isOpen ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {isComparing ? <ChangeNote againstLabel={againstLabel} figures={changeFigures(property.profit, previous ? previous.profit : 0)} higherIsBetter previous={previous ? previous.profit : 0} /> : null}
      {isOpen ? (
        <View style={{ paddingLeft: spacing.md }}>
          <HomeLinkRow accessibilityLabel={`${MESSAGES.revenue}, ${spokenMoney(property.revenue)}`} detail={formatCurrency(property.revenue)} label={MESSAGES.revenue} onPress={() => open("revenue")} />
          <HomeLinkRow accessibilityLabel={`${MESSAGES.expenses}, ${spokenMoney(property.expenses)}`} detail={formatCurrency(property.expenses)} label={MESSAGES.expenses} onPress={() => open("expenses")} />
          <HomeLinkRow label={MESSAGES.allTransactions} onPress={() => open()} />
          {monthly && monthly.months.length > 0 ? (
            <View accessibilityLabel={MESSAGES.monthlyByProperty} accessibilityRole="list">
              <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground, paddingTop: spacing.sm }}>{MESSAGES.monthlyByProperty}</Text>
              {monthsNewestFirst(monthly.months).map((month) => (
                <View key={month.month}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground, paddingTop: spacing.sm }}>{monthName(month.month, "long")}</Text>
                  <HomeLinkRow detail={formatCurrency(month.revenue)} label={MESSAGES.revenue} onPress={() => router.navigate(drillDownLink(propertyMonthDrillDown(property.property_id, name, month.month, "revenue", scope)))} />
                  <HomeLinkRow detail={formatCurrency(month.expenses)} label={MESSAGES.expenses} onPress={() => router.navigate(drillDownLink(propertyMonthDrillDown(property.property_id, name, month.month, "expenses", scope)))} />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
