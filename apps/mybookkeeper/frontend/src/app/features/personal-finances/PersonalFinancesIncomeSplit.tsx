import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { progressPercent } from "@mybookkeeper/api-client/utils/progressPercent";
import Card from "@/shared/components/ui/Card";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import PersonalFinancesShareRow from "./PersonalFinancesShareRow";

export interface PersonalFinancesIncomeSplitProps {
  data: PersonalFinances;
}

/** Salary, rent, one-offs and everything else, each as its share of income;
 * under rent, what the rentals netted after their costs. */
export default function PersonalFinancesIncomeSplit({ data }: PersonalFinancesIncomeSplitProps) {
  const money = (cents: number) => formatAccountBalance(cents, data.currency);
  const split = data.income_split;
  const whole = data.totals.income_cents;
  const parts = [
    { key: "salary", label: MSG.salary, cents: split.salary_cents },
    { key: "rental", label: MSG.rental, cents: split.rental_cents },
    { key: "one-off", label: MSG.oneOffIncome, cents: split.one_off_cents },
    { key: "other", label: MSG.otherIncome, cents: split.other_cents },
  ];
  const rentalNet = (
    <p
      className={`text-xs ${split.rental_net_cents < 0 ? "text-red-600" : "text-muted-foreground"}`}
      data-testid="personal-finances-rental-net"
    >
      {MSG.rentalNet(money(split.rental_net_cents), money(split.rental_costs_cents))}
    </p>
  );
  return (
    <Card title={MSG.incomeTitle}>
      <ul className="space-y-4" data-testid="personal-finances-income-split">
        {parts.map((part) => (
          <PersonalFinancesShareRow
            key={part.key}
            label={part.label}
            amount={money(part.cents)}
            percent={progressPercent(part.cents, whole)}
            testId={`personal-finances-income-${part.key}`}
            detail={part.key === "rental" ? rentalNet : undefined}
          />
        ))}
      </ul>
    </Card>
  );
}
