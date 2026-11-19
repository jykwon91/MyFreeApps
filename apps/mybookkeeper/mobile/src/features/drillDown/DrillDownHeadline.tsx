import { useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text } from "react-native";
import { DRILL_DOWN_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { spokenSignedMoney } from "../transactions/transactionDisplay";

interface DrillDownHeadlineProps {
  /** Whether the server has answered for this filter; nothing shows before it has. */
  isShown: boolean;
  /** How many rows match across every page, from the server. */
  count: number;
  /** What every matching row adds up to, from the server. */
  amountTotal: number;
}

/** "N transactions · $total" for everything the tapped figure covers, not only the rows loaded so far. */
export default function DrillDownHeadline({ isShown, count, amountTotal }: DrillDownHeadlineProps) {
  const { colors, fontSize } = useTheme();
  if (!isShown) return null;
  return (
    <Text accessibilityLabel={`${MESSAGES.count(count)}, ${spokenSignedMoney(amountTotal)}`} style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>
      {MESSAGES.count(count)} · {formatCurrency(amountTotal)}
    </Text>
  );
}
