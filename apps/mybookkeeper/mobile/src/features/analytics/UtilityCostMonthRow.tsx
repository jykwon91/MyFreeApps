import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Pressable, Text, View } from "react-native";
import { UTILITY_COSTS_MESSAGES as MESSAGES } from "../../constants/analytics";
import type { UtilityCostMonth } from "../../types/UtilityCostMonth";
import HomeLinkRow from "../home/HomeLinkRow";
import { spokenMoney } from "../transactions/transactionDisplay";
import UtilityCostBar from "./UtilityCostBar";
import { barPercent, monthLabel, spokenMonth } from "./utilityCostsDisplay";

interface UtilityCostMonthRowProps {
  month: UtilityCostMonth;
  largestCents: number;
  isPartial: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSeeBills: () => void;
}

export default function UtilityCostMonthRow({ month, largestCents, isPartial, isExpanded, onToggle, onSeeBills }: UtilityCostMonthRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const dollars = month.cents / 100;
  const hasBills = month.utilities.length > 0;
  const suffix = isPartial ? `, ${MESSAGES.soFar}` : "";
  const amount = hasBills ? formatCurrency(dollars) : MESSAGES.noBills;
  const body = (
    <>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <Text style={{ flexShrink: 1, fontSize: fontSize.md, color: colors.foreground }}>
          {monthLabel(month.period)}
          {suffix}
        </Text>
        <Text style={{ fontSize: fontSize.md, fontWeight: hasBills ? "600" : "400", color: hasBills ? colors.foreground : colors.mutedForeground }}>{amount}</Text>
      </View>
      <UtilityCostBar percent={barPercent(month.cents, largestCents)} />
    </>
  );
  const spoken = `${spokenMonth(month.period)}${suffix}, ${hasBills ? spokenMoney(dollars) : MESSAGES.noBills}`;
  const rowStyle = { gap: spacing.xs, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm };

  if (!hasBills) {
    return (
      <View accessible accessibilityLabel={spoken} style={rowStyle}>
        {body}
      </View>
    );
  }
  return (
    <View>
      <Pressable accessibilityLabel={spoken} accessibilityRole="button" accessibilityState={{ expanded: isExpanded }} onPress={onToggle} style={rowStyle}>
        {body}
      </Pressable>
      {isExpanded ? <HomeLinkRow label={MESSAGES.periodBills(monthLabel(month.period))} onPress={onSeeBills} /> : null}
      {isExpanded
        ? month.utilities.map((utility) => (
            <View
              accessible
              accessibilityLabel={`${utility.label}, ${spokenMoney(utility.cents / 100)}`}
              key={utility.subCategory}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.xs }}
            >
              <Text style={{ flexShrink: 1, fontSize: fontSize.sm, color: colors.mutedForeground }}>{utility.label}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatCurrency(utility.cents / 100)}</Text>
            </View>
          ))
        : null}
    </View>
  );
}
