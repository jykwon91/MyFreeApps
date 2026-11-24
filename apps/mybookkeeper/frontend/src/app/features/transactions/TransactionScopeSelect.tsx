import type { UseFormRegister } from "react-hook-form";
import { FormField } from "@platform/ui";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import Select from "@/shared/components/ui/Select";

const SCOPE_OPTIONS = [
  { value: "rental", label: "Rental" },
  { value: "business", label: "Business" },
  { value: "personal", label: "Personal" },
] as const;

export interface TransactionScopeSelectProps {
  register: UseFormRegister<TransactionFormValues>;
  value: string;
  dirty: boolean;
}

export default function TransactionScopeSelect({ register, value, dirty }: TransactionScopeSelectProps) {
  return (
    <FormField label="Scope" dirty={dirty}>
      {(field) => (
        <Select
          {...register("transaction_scope")}
          value={value}
          data-testid="transaction-scope-select"
          {...field}
        >
          {SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      )}
    </FormField>
  );
}
