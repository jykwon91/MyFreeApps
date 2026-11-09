import type { MortgageRefiOutlook } from "@mybookkeeper/api-client/types/mortgage/mortgage-refi-outlook";
import {
  formatBreakeven,
  formatMoneyBand,
  formatMoneyCents,
  formatMonths,
  formatRateBand,
  formatRatePct,
} from "@mybookkeeper/api-client/utils/mortgageFormat";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MORTGAGE_RATE_MESSAGES as MESSAGES } from "../../constants/mortgageRates";
import TransactionFact from "../transactions/TransactionFact";

/** The arithmetic behind one verdict in the order it was done; the break-even is last because it overturns the others. */
export default function RateOutlookNumbers({ outlook }: { outlook: MortgageRefiOutlook }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <TransactionFact label={MESSAGES.yourRate} value={formatRatePct(outlook.current_rate_pct)} />
      <TransactionFact label={MESSAGES.comparable} value={formatRateBand(outlook.comparable_rate_low_pct, outlook.comparable_rate_high_pct)} />
      <TransactionFact label={MESSAGES.paymentsLeft} value={formatMonths(outlook.remaining_term_months)} />
      <TransactionFact label={MESSAGES.paymentNow} value={`${formatMoneyCents(outlook.current_payment_cents)}${MESSAGES.perMonth}`} />
      <TransactionFact
        label={MESSAGES.paymentRefinanced}
        value={`${formatMoneyBand(outlook.new_payment_low_cents, outlook.new_payment_high_cents)}${MESSAGES.perMonth}`}
      />
      <TransactionFact
        label={MESSAGES.youdSave}
        value={`${formatMoneyBand(outlook.monthly_saving_low_cents, outlook.monthly_saving_high_cents)}${MESSAGES.perMonth}`}
      />
      <TransactionFact label={MESSAGES.closingCosts} value={formatMoneyBand(outlook.closing_cost_low_cents, outlook.closing_cost_high_cents)} />
      <TransactionFact label={MESSAGES.breakEven} value={formatBreakeven(outlook.breakeven_low_months, outlook.breakeven_high_months)} />
    </View>
  );
}
