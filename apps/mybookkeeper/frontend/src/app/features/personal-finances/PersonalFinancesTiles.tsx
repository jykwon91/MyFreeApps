import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import { PERSONAL_FINANCES_TILES_GRID_CLASS } from "@/shared/lib/personal-finances-pages";
import PersonalFinancesTile from "./PersonalFinancesTile";

export interface PersonalFinancesTilesProps {
  data: PersonalFinances;
}

/** Income, expenses, what was left, and a month on average. */
export default function PersonalFinancesTiles({ data }: PersonalFinancesTilesProps) {
  const money = (cents: number) => formatAccountBalance(cents, data.currency);
  const { totals, average } = data;
  const hasOneOffs = average.typical_net_cents !== average.net_cents;
  return (
    <div className={PERSONAL_FINANCES_TILES_GRID_CLASS} data-testid="personal-finances-tiles">
      <PersonalFinancesTile label={MSG.totalIncome} value={money(totals.income_cents)} testId="personal-finances-income" />
      <PersonalFinancesTile
        label={MSG.totalExpenses}
        value={money(totals.expenses_cents)}
        testId="personal-finances-expenses"
        hint={totals.mortgages_loans_cents > 0 ? MSG.ofWhichLoans(money(totals.mortgages_loans_cents)) : undefined}
      />
      <PersonalFinancesTile
        label={MSG.net}
        value={money(totals.net_cents)}
        testId="personal-finances-net"
        negative={totals.net_cents < 0}
      />
      <PersonalFinancesTile
        label={MSG.monthlyAverage}
        value={money(average.net_cents)}
        testId="personal-finances-average"
        negative={average.net_cents < 0}
        hint={hasOneOffs ? MSG.typicalMonth(money(average.typical_net_cents)) : MSG.averageAcross(average.months)}
      />
    </div>
  );
}
