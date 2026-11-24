import type { UseFormRegister } from "react-hook-form";
import { FormField } from "@platform/ui";
import { useListSpendingCategoriesQuery } from "@mybookkeeper/api-client/store/spendingCategoriesApi";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import Select from "@/shared/components/ui/Select";

export interface PersonalCategorySelectProps {
  register: UseFormRegister<TransactionFormValues>;
  value: string;
  dirty: boolean;
}

/**
 * Spending category picker — only shown when transaction_scope = 'personal'.
 * Lazy-loads the org's live spending categories.
 */
export default function PersonalCategorySelect({ register, value, dirty }: PersonalCategorySelectProps) {
  const { data, isLoading } = useListSpendingCategoriesQuery();

  return (
    <FormField label="Personal category" dirty={dirty}>
      {(field) => (
        <Select
          {...register("spending_category_id")}
          value={value}
          data-testid="personal-category-select"
          disabled={isLoading}
          {...field}
        >
          <option value="">— None —</option>
          {(data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      )}
    </FormField>
  );
}
