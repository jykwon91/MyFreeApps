import type { RentLedgerResponse } from "@mybookkeeper/api-client/types/rent/rent-ledger-response";
import { formatCurrency } from "@platform/core/utils/currency";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { owesInTotal, paidAhead, paidOfCharged, RENT_MESSAGES } from "../../constants/rent";
import { isMoreThanACent } from "./rentDisplay";

/**
 * total_charged includes the month in progress, so someone paying weekly "owes"
 * for most of every month. That's only worth red once a charge is actually overdue.
 */
export default function RentBalance({ ledger }: { ledger: RentLedgerResponse }) {
  const { colors, spacing, fontSize } = useTheme();
  const balance = Number(ledger.balance);
  const isSettled = !isMoreThanACent(balance);
  const headline = isSettled ? RENT_MESSAGES.settled : balance > 0 ? owesInTotal(formatCurrency(balance)) : paidAhead(formatCurrency(-balance));
  const totals = isSettled ? null : paidOfCharged(formatCurrency(ledger.total_paid), formatCurrency(ledger.total_charged));
  const isLate = balance > 0 && ledger.charges.some((charge) => charge.status === "overdue");

  return (
    <View accessible accessibilityLabel={`Balance: ${headline}.${totals ? ` ${totals}.` : ""}`} style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: isLate ? colors.destructive : colors.foreground }}>{headline}</Text>
      {totals ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{totals}</Text> : null}
    </View>
  );
}
