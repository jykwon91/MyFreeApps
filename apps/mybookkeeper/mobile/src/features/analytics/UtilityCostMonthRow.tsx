import { LabelValueRow, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Pressable, View } from "react-native";
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
  const { spacing } = useTheme();
  const dollars = month.cents / 100;
  const hasBills = month.utilities.length > 0;
  const suffix = isPartial ? `, ${MESSAGES.soFar}` : "";
  const amount = hasBills ? formatCurrency(dollars) : MESSAGES.noBills;
  const body = (
    <>
      <LabelValueRow
        accessible={false}
        label={`${monthLabel(month.period)}${suffix}`}
        labelTone="foreground"
        value={amount}
        valueTone={hasBills ? "foreground" : "muted"}
        valueWeight={hasBills ? "600" : "400"}
      />
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
            <View key={utility.subCategory} style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.xs }}>
              <LabelValueRow
                accessibilityLabel={`${utility.label}, ${spokenMoney(utility.cents / 100)}`}
                label={utility.label}
                labelSize="sm"
                value={formatCurrency(utility.cents / 100)}
                valueSize="sm"
                valueTone="muted"
              />
            </View>
          ))
        : null}
    </View>
  );
}
