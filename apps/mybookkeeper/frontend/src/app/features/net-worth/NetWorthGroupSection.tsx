import type { NetWorthGroup } from "@mybookkeeper/api-client/types/net-worth/net-worth-group";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { NET_WORTH_GROUP_LABELS } from "@/shared/lib/net-worth-messages";
import NetWorthLineRow from "./NetWorthLineRow";

export interface NetWorthGroupSectionProps {
  group: NetWorthGroup;
  currency: string;
}

/** One group (Cash, Property, Loans & mortgages…) with what it adds up to. */
export default function NetWorthGroupSection({ group, currency }: NetWorthGroupSectionProps) {
  return (
    <section className="space-y-2" data-testid={`net-worth-group-${group.key}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{NET_WORTH_GROUP_LABELS[group.key]}</h2>
        <p className="text-sm font-medium tabular-nums" data-testid="net-worth-group-total">{formatAccountBalance(group.total_cents, currency)}</p>
      </div>
      <ul className="space-y-2">
        {group.lines.map((line) => (
          <NetWorthLineRow key={`${line.source}-${line.id}`} line={line} totalCurrency={currency} />
        ))}
      </ul>
    </section>
  );
}
