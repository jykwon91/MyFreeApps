import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import {
  formatAnnualPremium,
  formatBilledPremium,
  formatPolicyMoney,
  formatWindHailDeductible,
} from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import TransactionFact from "../transactions/TransactionFact";
import { policyTerm } from "./policyDisplay";

export default function PolicyFacts({ policy }: { policy: InsurancePolicyDetail }) {
  const { colors, spacing, fontSize } = useTheme();
  const term = policyTerm(policy.effective_date, policy.expiration_date);
  return (
    <View style={{ gap: spacing.md }}>
      {policy.policy_number ? (
        <View accessible style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_MESSAGES.policyNumber}</Text>
          <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
            {policy.policy_number}
          </Text>
        </View>
      ) : null}
      {policy.coverage_amount_cents !== null ? (
        <TransactionFact label={INSURANCE_MESSAGES.coverage} value={formatPolicyMoney(policy.coverage_amount_cents)} />
      ) : null}
      {policy.deductible_cents !== null ? (
        <TransactionFact label={INSURANCE_MESSAGES.deductible} value={formatPolicyMoney(policy.deductible_cents)} />
      ) : null}
      {policy.wind_hail_deductible_pct !== null ? (
        <TransactionFact
          label={INSURANCE_MESSAGES.windHail}
          value={formatWindHailDeductible(policy.wind_hail_deductible_pct, policy.coverage_amount_cents)}
        />
      ) : null}
      {policy.premium_cents !== null ? (
        <TransactionFact label={INSURANCE_MESSAGES.billedPremium} value={formatBilledPremium(policy.premium_cents, policy.premium_frequency)} />
      ) : null}
      {policy.annual_premium_cents !== null ? (
        <TransactionFact label={INSURANCE_MESSAGES.annualPremium} value={formatAnnualPremium(policy.annual_premium_cents)} />
      ) : null}
      {policy.fees_and_taxes_cents !== null ? (
        <TransactionFact label={INSURANCE_MESSAGES.feesAndTaxes} value={formatPolicyMoney(policy.fees_and_taxes_cents)} />
      ) : null}
      {policy.annual_total_cents !== null ? (
        <TransactionFact label={INSURANCE_MESSAGES.annualTotal} value={formatAnnualPremium(policy.annual_total_cents)} />
      ) : null}
      {term ? <TransactionFact label={INSURANCE_MESSAGES.term} value={term} /> : null}
      {policy.notes ? <TransactionFact label={INSURANCE_MESSAGES.notes} value={policy.notes} /> : null}
    </View>
  );
}
