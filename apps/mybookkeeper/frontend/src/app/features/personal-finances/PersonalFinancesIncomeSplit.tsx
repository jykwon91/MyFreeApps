import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { progressPercent } from "@mybookkeeper/api-client/utils/progressPercent";
import Card from "@/shared/components/ui/Card";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import PersonalFinancesShareRow from "./PersonalFinancesShareRow";

export interface PersonalFinancesIncomeSplitProps {
  data: PersonalFinances;
}

/** Salary, rentals after their costs, and everything else. */
export default function PersonalFinancesIncomeSplit({ data }: PersonalFinancesIncomeSplitProps) {
  const money = (cents: number) => formatAccountBalance(cents, data.currency);
  const { salary_cents, rental_net_cents, other_cents } = data.income_split;
  const parts = [
    { key: "salary", label: MSG.salary, cents: salary_cents },
    { key: "rental", label: MSG.rentalNet, cents: rental_net_cents },
    { key: "other", label: MSG.otherIncome, cents: other_cents },
  ];
  // A rental that cost more than it brought in has no share of what came in.
  const whole = parts.reduce((sum, part) => sum + Math.max(0, part.cents), 0);
  return (
    <Card title={MSG.incomeTitle}>
      <ul className="space-y-4" data-testid="personal-finances-income-split">
        {parts.map((part) => (
          <PersonalFinancesShareRow
            key={part.key}
            label={part.label}
            amount={money(part.cents)}
            percent={progressPercent(Math.max(0, part.cents), whole)}
            testId={`personal-finances-income-${part.key}`}
          />
        ))}
      </ul>
    </Card>
  );
}
