import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Pressable, Text } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import ChangeNote from "../analyticsControls/ChangeNote";
import { moneySign, signedMoney, spokenMoney, spokenSignedMoney } from "../transactions/transactionDisplay";

interface TotalFigureProps {
  label: string;
  amount: number;
  /** What it was in the stretch compared against, or null when not comparing. */
  previous: number | null;
  /** Net is shown with a sign; revenue and expenses are plain amounts. */
  isSigned?: boolean;
  higherIsBetter: boolean;
  againstLabel: string;
  onPress?: () => void;
}

export default function TotalFigure({ label, amount, previous, isSigned = false, higherIsBetter, againstLabel, onPress }: TotalFigureProps) {
  const { colors, spacing, fontSize } = useTheme();
  const text = isSigned ? signedMoney(amount) : formatCurrency(amount);
  const spoken = isSigned ? spokenSignedMoney(amount) : spokenMoney(amount);
  return (
    <Pressable
      accessibilityHint={onPress ? MESSAGES.seeTransactions : undefined}
      accessibilityLabel={`${label}, ${spoken}`}
      accessibilityRole={onPress ? "button" : "text"}
      disabled={!onPress}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, gap: spacing.xs }}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{label}</Text>
      <Text style={{ fontSize: fontSize.xl, fontWeight: "700", fontVariant: ["tabular-nums"], color: isSigned && moneySign(amount) > 0 ? colors.positiveText : colors.foreground }}>{text}</Text>
      {previous === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(amount, previous)} higherIsBetter={higherIsBetter} previous={previous} />}
    </Pressable>
  );
}
