import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import Card from "@/shared/components/ui/Card";
import { formatDate } from "@/shared/utils/date";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";

export interface PersonalFinancesOneOffsProps {
  data: PersonalFinances;
}

/** Large payments in that didn't recur: in the totals, out of the typical month. Hidden when there are none. */
export default function PersonalFinancesOneOffs({ data }: PersonalFinancesOneOffsProps) {
  if (data.one_offs.length === 0) return null;
  return (
    <Card title={MSG.oneOffsTitle}>
      <p className="mb-3 text-sm text-muted-foreground">{MSG.oneOffsHelp}</p>
      <ul className="divide-y" data-testid="personal-finances-one-offs">
        {data.one_offs.map((oneOff) => (
          <li
            key={oneOff.transaction_id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm"
            data-testid="personal-finances-one-off"
          >
            <span className="min-w-0">
              <span className="font-medium">{oneOff.payee}</span>
              <span className="ml-2 text-muted-foreground">{formatDate(oneOff.date)}</span>
            </span>
            <span className="tabular-nums font-medium">{formatAccountBalance(oneOff.amount_cents, data.currency)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
