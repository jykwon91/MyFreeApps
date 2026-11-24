import { useId } from "react";
import { CASH_FLOW_RANGES, CASH_FLOW_SCOPES } from "@mybookkeeper/api-client/constants/budget";
import { useListFinancialAccountsQuery } from "@mybookkeeper/api-client/store/financialAccountsApi";
import type { CashFlowQuery } from "@mybookkeeper/api-client/types/cash-flow/cash-flow-query";
import SegmentedControl from "@/shared/components/ui/SegmentedControl";
import Select from "@/shared/components/ui/Select";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";

export interface CashFlowControlsProps {
  value: CashFlowQuery;
  onChange: (next: CashFlowQuery) => void;
}

const ALL_ACCOUNTS = "";

/** Which months, which money (personal, rental, business or all), and optionally one account. */
export default function CashFlowControls({ value, onChange }: CashFlowControlsProps) {
  const accountSelectId = useId();
  const accounts = useListFinancialAccountsQuery().data?.items ?? [];

  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="cash-flow-controls">
      <SegmentedControl
        options={CASH_FLOW_RANGES}
        value={value.range}
        onChange={(range) => onChange({ ...value, range })}
        label={MSG.rangeLabel}
        testIdPrefix="cash-flow-range"
      />
      <SegmentedControl
        options={CASH_FLOW_SCOPES}
        value={value.scope}
        onChange={(scope) => onChange({ ...value, scope })}
        label={MSG.scopeLabel}
        testIdPrefix="cash-flow-scope"
      />
      {accounts.length > 0 ? (
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label htmlFor={accountSelectId} className="text-xs font-medium text-muted-foreground">{MSG.accountLabel}</label>
          <Select
            id={accountSelectId}
            value={value.accountId ?? ALL_ACCOUNTS}
            onChange={(e) => onChange({ ...value, accountId: e.target.value === ALL_ACCOUNTS ? null : e.target.value })}
            className="min-h-[44px] w-full sm:w-56 bg-background"
            data-testid="cash-flow-account"
          >
            <option value={ALL_ACCOUNTS}>{MSG.allAccounts}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
