import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { progressPercent } from "@mybookkeeper/api-client/utils/progressPercent";
import Card from "@/shared/components/ui/Card";
import EmptyState from "@/shared/components/ui/EmptyState";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import PersonalFinancesShareRow from "./PersonalFinancesShareRow";

export interface PersonalFinancesCategoriesProps {
  data: PersonalFinances;
}

/** Expenses by heading, largest first, headed as Monthly expenses heads them. */
export default function PersonalFinancesCategories({ data }: PersonalFinancesCategoriesProps) {
  const money = (cents: number) => formatAccountBalance(cents, data.currency);
  const whole = data.totals.expenses_cents;
  return (
    <Card title={MSG.categoriesTitle}>
      {data.by_category.length === 0 ? (
        <EmptyState message={MSG.categoriesEmpty} />
      ) : (
        <ul className="space-y-4" data-testid="personal-finances-categories">
          {data.by_category.map((category) => (
            <PersonalFinancesShareRow
              key={category.label}
              label={category.label}
              amount={money(category.cents)}
              percent={progressPercent(category.cents, whole)}
              testId="personal-finances-category"
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
