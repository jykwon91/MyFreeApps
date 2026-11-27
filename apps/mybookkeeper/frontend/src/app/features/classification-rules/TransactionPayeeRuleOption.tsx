import { PAYEE_RULE_MESSAGES as MSG } from "@/shared/lib/payee-rule-messages";

export interface TransactionPayeeRuleOptionProps {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** The "always file payments to this payee like this" choice; it takes effect when the row is saved. */
export default function TransactionPayeeRuleOption({ checked, disabled, onChange }: TransactionPayeeRuleOptionProps) {
  return (
    <div className="px-5 py-3 border-t">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium">{MSG.alwaysFileLabel}</span>
          <span className="block text-xs text-muted-foreground">{MSG.alwaysFileHint}</span>
        </span>
      </label>
    </div>
  );
}
