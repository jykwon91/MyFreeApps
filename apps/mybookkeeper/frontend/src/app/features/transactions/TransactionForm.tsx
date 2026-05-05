import { useCallback, useEffect, useState } from "react";
import { UseFormRegister, UseFormWatch, UseFormSetValue, FieldErrors } from "react-hook-form";
import { X, FileText } from "lucide-react";
import api from "@/shared/lib/api";
import { formatTag } from "@/shared/utils/tag";
import { EXPENSE_CATEGORY_LIST, INCOME_CATEGORIES, PAYMENT_METHODS, CHANNELS } from "@/shared/lib/constants";
import type { Transaction } from "@/shared/types/transaction/transaction";
import type { Property } from "@/shared/types/property/property";
import type { TransactionFormValues } from "@/shared/types/transaction/transaction-form-values";
import type { DuplicateTransaction } from "@/shared/types/transaction/duplicate";
import type { SourcePreview } from "@/shared/types/transaction/source-preview";
import FormField from "@/shared/components/ui/FormField";
import Select from "@/shared/components/ui/Select";
import TransactionDuplicateActions from "@/app/features/transactions/TransactionDuplicateActions";
import { useGetVendorsQuery } from "@/shared/store/vendorsApi";
import SourcePreviewBody from "./SourcePreviewBody";

export interface TransactionFormProps {
  transaction: Transaction;
  properties: readonly Property[];
  register: UseFormRegister<TransactionFormValues>;
  watch: UseFormWatch<TransactionFormValues>;
  setValue: UseFormSetValue<TransactionFormValues>;
  dirtyFields: Partial<Record<keyof TransactionFormValues, boolean>>;
  errors?: FieldErrors<TransactionFormValues>;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  dupOther: DuplicateTransaction | null;
  onKeepDuplicate?: (keepId: string, deleteIds: string[]) => Promise<void>;
  onDismissDuplicate?: (transactionIds: string[]) => Promise<void>;
}

export default function TransactionForm({
  transaction,
  properties,
  register,
  watch,
  setValue,
  dirtyFields,
  onSubmit,
  dupOther,
  onKeepDuplicate,
  onDismissDuplicate,
}: TransactionFormProps) {
  const [sourcePreview, setSourcePreview] = useState<SourcePreview | null>(null);

  const transactionType = watch("transaction_type");
  const categories = transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORY_LIST;

  // PR 4.2: vendor rolodex for the "Assign vendor" dropdown. Bound is
  // generous — listing 100 vendors at once is fine for typical hosts.
  const { data: vendorsData, isLoading: vendorsLoading } = useGetVendorsQuery({
    limit: 100,
    offset: 0,
  });
  const vendors = vendorsData?.items ?? [];

  const revokePreview = useCallback(() => {
    setSourcePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => revokePreview, [revokePreview]);

  useEffect(() => {
    if (!sourcePreview) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") revokePreview();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sourcePreview, revokePreview]);

  const handleViewSource = useCallback(async (docId: string) => {
    try {
      const res = await api.get(`/documents/${docId}/download`, { responseType: "blob" });
      const blob = res.data as Blob;
      const contentType = String(res.headers["content-type"] ?? "");
      const url = URL.createObjectURL(blob);
      const type = contentType.includes("pdf") ? "pdf" : contentType.startsWith("image/") ? "image" : "other";
      revokePreview();
      setSourcePreview({ url, type });
    } catch {
      revokePreview();
    }
  }, [revokePreview]);

  function fieldClass(name: keyof TransactionFormValues): string {
    return dirtyFields[name]
      ? "w-full border-2 border-primary rounded-md px-3 py-2 text-sm ring-1 ring-primary/20"
      : "w-full border rounded-md px-3 py-2 text-sm";
  }

  function selectClass(name: keyof TransactionFormValues): string {
    return dirtyFields[name] ? "w-full border-2 border-primary ring-1 ring-primary/20" : "w-full";
  }

  return (
    <form id="transaction-panel-form" className="flex-1 overflow-y-auto px-5 py-4 space-y-4" onSubmit={onSubmit}>

      {transaction.status === "needs_review" && transaction.review_reason && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          {transaction.review_reason}
        </div>
      )}

      {dupOther && onKeepDuplicate && onDismissDuplicate && (
        <TransactionDuplicateActions
          transactionId={transaction.id}
          dupOther={dupOther}
          onKeepDuplicate={onKeepDuplicate}
          onDismissDuplicate={onDismissDuplicate}
        />
      )}

      {transaction.source_file_name && transaction.source_document_id && (
        <div className="flex items-center gap-2 text-sm">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <button
            type="button"
            onClick={() => handleViewSource(transaction.source_document_id!)}
            className="text-primary hover:underline truncate text-left"
          >
            {transaction.source_file_name}
          </button>
        </div>
      )}

      {sourcePreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={revokePreview}>
          <div className="bg-card rounded-lg shadow-xl max-w-3xl max-h-[80vh] w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-medium truncate">{transaction.source_file_name}</span>
              <button type="button" onClick={revokePreview} className="text-muted-foreground hover:text-foreground p-1">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-auto max-h-[calc(80vh-3rem)] flex items-center justify-center">
              <SourcePreviewBody
                mode={sourcePreview.type}
                url={sourcePreview.url}
                fileName={transaction.source_file_name}
              />
            </div>
          </div>
        </div>
      )}

      <FormField label="Date" dirty={!!dirtyFields.transaction_date}>
        <input
          type="date"
          {...register("transaction_date")}
          className={fieldClass("transaction_date")}
        />
      </FormField>

      <FormField label="Tax Year" dirty={!!dirtyFields.tax_year}>
        <input
          type="number"
          {...register("tax_year", { valueAsNumber: true })}
          className={fieldClass("tax_year")}
          min={2020}
          max={2099}
        />
      </FormField>

      <FormField label="Vendor" dirty={!!dirtyFields.vendor}>
        <input
          type="text"
          {...register("vendor")}
          className={fieldClass("vendor")}
        />
      </FormField>

      {/* PR 4.2: link this transaction to a row in the Vendors rolodex.
          The "(none)" option submits ``vendor_id: null`` to detach. */}
      <FormField label="Assign vendor" dirty={!!dirtyFields.vendor_id}>
        {vendorsLoading ? (
          <div
            className="h-10 w-full bg-muted/40 rounded-md animate-pulse"
            data-testid="vendor-id-select-skeleton"
          />
        ) : (
          <Select
            {...register("vendor_id")}
            className={selectClass("vendor_id")}
            data-testid="vendor-id-select"
          >
            <option value="">(none)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>

      <FormField label="Description" dirty={!!dirtyFields.description}>
        <textarea
          {...register("description")}
          className={fieldClass("description")}
          rows={2}
        />
      </FormField>

      <FormField label="Amount" dirty={!!dirtyFields.amount}>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
          <input
            type="number"
            {...register("amount")}
            className={`${fieldClass("amount")} pl-7`}
            step="0.01"
            min="0.01"
          />
        </div>
      </FormField>

      <FormField label="Type" dirty={!!dirtyFields.transaction_type}>
        <Select
          {...register("transaction_type", {
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
              setValue("category", e.target.value === "income" ? "rental_revenue" : "maintenance", { shouldDirty: true });
            },
          })}
          className={selectClass("transaction_type")}
        >
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </Select>
      </FormField>

      <FormField label="Category" dirty={!!dirtyFields.category}>
        <Select {...register("category")} className={selectClass("category")}>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{formatTag(cat)}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Property" dirty={!!dirtyFields.property_id}>
        <Select {...register("property_id")} className={selectClass("property_id")}>
          <option value="">No property</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Channel" dirty={!!dirtyFields.channel}>
        <Select {...register("channel")} className={selectClass("channel")}>
          <option value="">None</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{formatTag(c)}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Payment Method" dirty={!!dirtyFields.payment_method}>
        <Select {...register("payment_method")} className={selectClass("payment_method")}>
          <option value="">None</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{formatTag(m)}</option>
          ))}
        </Select>
      </FormField>

      <FormField label="Tax Relevant" dirty={!!dirtyFields.tax_relevant}>
        <label className={`flex items-center gap-2 text-sm ${dirtyFields.tax_relevant ? "text-primary font-medium" : ""}`}>
          <input
            type="checkbox"
            {...register("tax_relevant")}
            className="cursor-pointer"
          />
          <span>Include in tax reports</span>
        </label>
      </FormField>

      {transaction.schedule_e_line && (
        <div className="text-xs text-muted-foreground">
          Schedule E: {formatTag(transaction.schedule_e_line)}
        </div>
      )}
    </form>
  );
}
