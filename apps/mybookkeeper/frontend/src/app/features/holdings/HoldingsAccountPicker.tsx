import { useId } from "react";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import Select from "@/shared/components/ui/Select";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

export interface HoldingsAccountPickerProps {
  accounts: FinancialAccount[];
  value: string | null;
  onChange: (accountId: string | null) => void;
}

const ALL_ACCOUNTS = "";

/** Every investment account together, or one of them. */
export default function HoldingsAccountPicker({ accounts, value, onChange }: HoldingsAccountPickerProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1 w-full sm:w-auto">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{MSG.accountLabel}</label>
      <Select
        id={id}
        value={value ?? ALL_ACCOUNTS}
        onChange={(e) => onChange(e.target.value === ALL_ACCOUNTS ? null : e.target.value)}
        className="min-h-[44px] w-full sm:w-64 bg-background"
        data-testid="holdings-account"
      >
        <option value={ALL_ACCOUNTS}>{MSG.allAccounts}</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>{account.name}</option>
        ))}
      </Select>
    </div>
  );
}
