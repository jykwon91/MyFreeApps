import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import FinancialAccountRow from "./FinancialAccountRow";

export interface FinancialAccountSectionProps {
  title: string;
  testId: string;
  accounts: readonly FinancialAccount[];
  onEdit: (account: FinancialAccount) => void;
  onUpdateBalance: (account: FinancialAccount) => void;
}

/** A titled list of accounts; nothing at all when there are none, so an empty heading never shows. */
export default function FinancialAccountSection({ title, testId, accounts, onEdit, onUpdateBalance }: FinancialAccountSectionProps) {
  if (accounts.length === 0) return null;
  return (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      <ul className="space-y-2">
        {accounts.map((account) => (
          <FinancialAccountRow key={account.id} account={account} onEdit={onEdit} onUpdateBalance={onUpdateBalance} />
        ))}
      </ul>
    </section>
  );
}
