import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import { formatMoneyCents, formatMonths, formatRatePct } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { fullDateLabel } from "../../lib/localDate";
import TransactionFact from "../transactions/TransactionFact";
import { balanceLine, paymentLines } from "./mortgageDisplay";
import MortgageLoanNumber from "./MortgageLoanNumber";

export default function MortgageFacts({ mortgage }: { mortgage: Mortgage }) {
  const { spacing } = useTheme();
  const balance = balanceLine(mortgage);
  const loanNumber = mortgage.account_number?.trim();
  return (
    <View style={{ gap: spacing.md }}>
      {balance ? <TransactionFact label={MORTGAGE_MESSAGES.balance} value={balance} /> : null}
      {mortgage.interest_rate !== null ? <TransactionFact label={MORTGAGE_MESSAGES.rate} value={formatRatePct(mortgage.interest_rate)} /> : null}
      {paymentLines(mortgage).map((line) => (
        <TransactionFact key={line.label} label={line.label} value={line.value} />
      ))}
      {loanNumber ? <MortgageLoanNumber loanNumber={loanNumber} /> : null}
      {mortgage.maturity_date ? <TransactionFact label={MORTGAGE_MESSAGES.loanEnds} value={fullDateLabel(mortgage.maturity_date)} /> : null}
      {mortgage.term_months !== null ? <TransactionFact label={MORTGAGE_MESSAGES.loanLength} value={formatMonths(mortgage.term_months)} /> : null}
      {mortgage.original_principal_cents !== null ? (
        <TransactionFact label={MORTGAGE_MESSAGES.originalLoan} value={formatMoneyCents(mortgage.original_principal_cents)} />
      ) : null}
      {mortgage.notes ? <TransactionFact label={MORTGAGE_MESSAGES.notes} value={mortgage.notes} /> : null}
    </View>
  );
}
