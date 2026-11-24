import { FINANCIAL_ACCOUNT_CLASSIFICATION, FINANCIAL_ACCOUNT_TYPES, FINANCIAL_ACCOUNT_TYPE_LABELS } from "@mybookkeeper/api-client/constants/financialAccountTypes";
import type { FormFieldControlProps, fieldFeedbackAria } from "@platform/ui";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import { FINANCIAL_ACCOUNT_INPUT_CLASS } from "./financial-account-input-class";

export interface FinancialAccountTypeSelectProps {
  value: string;
  onChange: (value: string) => void;
  field: FormFieldControlProps;
  ariaProps: ReturnType<typeof fieldFeedbackAria>;
}

const ASSET_TYPES = FINANCIAL_ACCOUNT_TYPES.filter((type) => FINANCIAL_ACCOUNT_CLASSIFICATION[type] === "asset");
const LIABILITY_TYPES = FINANCIAL_ACCOUNT_TYPES.filter((type) => FINANCIAL_ACCOUNT_CLASSIFICATION[type] === "liability");

/** The kinds of account, grouped the way the page groups them, so the choice says where the account will show. */
export default function FinancialAccountTypeSelect({ value, onChange, field, ariaProps }: FinancialAccountTypeSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={FINANCIAL_ACCOUNT_INPUT_CLASS}
      data-testid="financial-account-type-select"
      {...ariaProps}
      {...field}
    >
      <option value="">Select a kind…</option>
      <optgroup label={MSG.assets}>
        {ASSET_TYPES.map((type) => (
          <option key={type} value={type}>{FINANCIAL_ACCOUNT_TYPE_LABELS[type]}</option>
        ))}
      </optgroup>
      <optgroup label={MSG.liabilities}>
        {LIABILITY_TYPES.map((type) => (
          <option key={type} value={type}>{FINANCIAL_ACCOUNT_TYPE_LABELS[type]}</option>
        ))}
      </optgroup>
    </select>
  );
}
