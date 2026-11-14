import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { taxYearOf } from "@mybookkeeper/api-client/utils/transactionTaxYear";
import { formatTag } from "@/shared/utils/tag";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES, PAYMENT_METHODS, CHANNELS } from "@/shared/lib/constants";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import { FormField, LoadingButton, Panel, PanelTitle } from "@platform/ui";
import Select from "@/shared/components/ui/Select";
import { useCreateTransactionMutation } from "@mybookkeeper/api-client/store/transactionsApi";

export interface ManualEntryFormProps {
  properties: readonly Property[];
  onClose: () => void;
  onSuccess: () => void;
  onError?: (message: string) => void;
}

function buildDefaults(): TransactionFormValues {
  const today = format(new Date(), "yyyy-MM-dd");
  return {
    transaction_date: today,
    tax_year: taxYearOf(today),
    vendor: "",
    // PR 4.2: vendor_id dropdown lives only on the edit panel; manual entry
    // defaults to no rolodex link. Hosts can attach a vendor afterwards.
    vendor_id: "",
    description: "",
    amount: "",
    transaction_type: "expense",
    category: "maintenance",
    property_id: "",
    tax_relevant: false,
    channel: "",
    payment_method: "",
  };
}

export default function ManualEntryForm({ properties, onClose, onSuccess, onError }: ManualEntryFormProps) {
  const [createTransaction, { isLoading }] = useCreateTransactionMutation();

  const { register, handleSubmit, watch, setValue } = useForm<TransactionFormValues>({
    defaultValues: buildDefaults(),
  });

  const transactionType = watch("transaction_type");
  const amount = watch("amount");
  const transactionDate = watch("transaction_date");
  const category = watch("category");

  const categories = transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORY_LIST;
  const isValid = amount && parseFloat(amount) > 0 && transactionDate && category;

  async function onSubmit(data: TransactionFormValues) {
    try {
      await createTransaction({
        transaction_date: data.transaction_date,
        tax_year: data.tax_year,
        vendor: data.vendor || null,
        description: data.description || null,
        amount: data.amount,
        transaction_type: data.transaction_type,
        category: data.category,
        property_id: data.property_id || null,
        tax_relevant: data.tax_relevant,
        channel: data.channel || null,
        payment_method: data.payment_method || null,
        is_manual: true,
      } as Partial<Transaction>).unwrap();

      onSuccess();
    } catch {
      onError?.("Failed to create transaction");
    }
  }

  return (
    <Panel position="right" onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <PanelTitle asChild>
          <h2 className="font-semibold">New Transaction</h2>
        </PanelTitle>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">Cancel</button>
      </div>

      <form id="manual-entry-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <FormField label="Date" required>
          {(field) => (
            <input
              type="date"
              {...register("transaction_date", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.value) {
                    setValue("tax_year", taxYearOf(e.target.value));
                  }
                },
              })}
              className="w-full border rounded-md px-3 py-2 text-sm"
              required
              {...field}
            />
          )}
        </FormField>

        <FormField label="Type" required>
          {(field) => (
            <Select
              {...register("transaction_type", {
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                  setValue("category", e.target.value === "income" ? "rental_revenue" : "maintenance");
                },
              })}
              className="w-full"
              {...field}
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </Select>
          )}
        </FormField>

        <FormField label="Amount" required>
          {(field) => (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
              <input
                type="number"
                {...register("amount")}
                className="w-full border rounded-md pl-7 pr-3 py-2 text-sm"
                placeholder="0.00"
                step="0.01"
                min="0.01"
                required
                {...field}
              />
            </div>
          )}
        </FormField>

        <FormField label="Vendor">
          {(field) => (
            <input
              type="text"
              {...register("vendor")}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. Home Depot"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Description">
          {(field) => (
            <textarea
              {...register("description")}
              className="w-full border rounded-md px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional details"
              {...field}
            />
          )}
        </FormField>

        <FormField label="Category" required>
          {(field) => (
            <Select {...register("category")} className="w-full"
              {...field}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{formatTag(cat)}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Property">
          {(field) => (
            <Select {...register("property_id")} className="w-full"
              {...field}
            >
              <option value="">No property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Channel">
          {(field) => (
            <Select {...register("channel")} className="w-full"
              {...field}
            >
              <option value="">None</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{formatTag(c)}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Payment Method">
          {(field) => (
            <Select {...register("payment_method")} className="w-full"
              {...field}
            >
              <option value="">None</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{formatTag(m)}</option>
              ))}
            </Select>
          )}
        </FormField>

        <FormField label="Tax Relevant" group>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register("tax_relevant")}
              className="cursor-pointer"
            />
            <span>Include in tax reports</span>
          </label>
        </FormField>
      </form>

      <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <LoadingButton
          type="submit"
          form="manual-entry-form"
          size="sm"
          variant="primary"
          isLoading={isLoading}
          loadingText="Creating..."
          disabled={!isValid}
        >
          Create Transaction
        </LoadingButton>
      </div>
    </Panel>
  );
}
