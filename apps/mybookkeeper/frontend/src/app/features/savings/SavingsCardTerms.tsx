import type { SavingsCardDetails } from "@mybookkeeper/api-client/types/savings/savings-card-details";
import { formatWholeDollars } from "@mybookkeeper/api-client/utils/savingsFormat";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";

export interface SavingsCardTermsProps {
  details: SavingsCardDetails;
}

interface Term {
  label: string;
  value: string;
}

function minimumSpendText(details: SavingsCardDetails): string | null {
  if (details.minimum_spend_dollars === null) return null;
  const amount = formatWholeDollars(details.minimum_spend_dollars);
  if (details.spend_window_months === null) return amount;
  return `${amount} ${MSG.spendWithin(details.spend_window_months)}`;
}

function dollarsOrNull(dollars: number | null): string | null {
  return dollars === null ? null : formatWholeDollars(dollars);
}

/** A credit card offer's terms; any the research didn't find are left out. */
export default function SavingsCardTerms({ details }: SavingsCardTermsProps) {
  const candidates: Array<{ label: string; value: string | null }> = [
    { label: MSG.signUpBonus, value: details.sign_up_bonus },
    { label: MSG.minimumSpend, value: minimumSpendText(details) },
    { label: MSG.annualFee, value: dollarsOrNull(details.annual_fee_dollars) },
    { label: MSG.firstYearValue, value: dollarsOrNull(details.first_year_value_dollars) },
    { label: MSG.creditImpact, value: details.credit_impact },
  ];
  const terms = candidates.filter((term): term is Term => term.value !== null && term.value !== "");
  if (terms.length === 0) return null;

  return (
    <div className="space-y-1" data-testid="savings-card-terms">
      <h4 className="text-sm font-medium">{MSG.cardTerms}</h4>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {terms.map((term) => (
          <div key={term.label} className="contents">
            <dt className="text-muted-foreground">{term.label}</dt>
            <dd>{term.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
