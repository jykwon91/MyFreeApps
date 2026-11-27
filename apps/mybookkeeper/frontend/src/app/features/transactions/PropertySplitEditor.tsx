import { useId, useState } from "react";
import { Button, LoadingButton } from "@platform/ui";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { cn } from "@/shared/utils/cn";
import { PROPERTY_SPLIT_LABELS as L } from "@mybookkeeper/api-client/constants/propertySplitLabels";
import { MIN_SPLIT_PROPERTIES } from "@mybookkeeper/api-client/constants/propertySplitLimits";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import type { PropertySplitDraftRow } from "@mybookkeeper/api-client/types/transaction/PropertySplitDraftRow";
import type { TransactionPropertySplit } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplit";
import type { TransactionPropertySplitRequest } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplitRequest";
import { amountToCents } from "@mybookkeeper/api-client/utils/amountToCents";
import { checkDraft, draftFromSplits, draftShares, draftStatus, evenDraft } from "@mybookkeeper/api-client/utils/propertySplit";

export interface PropertySplitEditorProps {
  /** The transaction's saved amount, which the shares must add up to. */
  amount: string;
  properties: readonly Property[];
  splits: readonly TransactionPropertySplit[];
  isSaving: boolean;
  onSave: (request: TransactionPropertySplitRequest) => void;
  onCancel: () => void;
}

/** Tick the properties sharing the transaction and give each its amount, or split it evenly. */
export default function PropertySplitEditor({ amount, properties, splits, isSaving, onSave, onCancel }: PropertySplitEditorProps) {
  const statusId = useId();
  const totalCents = amountToCents(amount);
  const [rows, setRows] = useState<PropertySplitDraftRow[]>(() =>
    draftFromSplits(properties.map((property) => property.id), splits),
  );
  const check = checkDraft(rows, totalCents, NUMBER_INPUT_DECIMAL_SEPARATOR);
  const names = new Map(properties.map((property) => [property.id, property.name]));

  function updateRow(propertyId: string, change: Partial<PropertySplitDraftRow>) {
    setRows((current) => current.map((row) => (row.property_id === propertyId ? { ...row, ...change } : row)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (check.canSave) onSave({ shares: draftShares(rows, NUMBER_INPUT_DECIMAL_SEPARATOR) });
  }

  const tooFew = check.includedCount < MIN_SPLIT_PROPERTIES;

  return (
    <form noValidate onSubmit={submit} className="space-y-3" data-testid="property-split-editor">
      <ul className="space-y-2">
        {rows.map((row) => {
          const name = names.get(row.property_id) ?? "";
          return (
            <li key={row.property_id} className="flex items-center gap-2">
              <label className="flex flex-1 min-w-0 items-center gap-2 text-sm min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={row.included}
                  onChange={(e) => updateRow(row.property_id, { included: e.target.checked, amount: e.target.checked ? row.amount : "" })}
                  aria-label={L.includeAria(name)}
                  disabled={isSaving}
                />
                <span className="truncate">{name}</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => updateRow(row.property_id, { amount: e.target.value, included: true })}
                aria-label={L.shareAmountAria(name)}
                aria-describedby={statusId}
                disabled={isSaving}
                placeholder="0.00"
                className="w-28 min-h-[44px] border rounded-md px-3 py-2 text-sm text-right bg-background"
              />
            </li>
          );
        })}
      </ul>
      <p
        id={statusId}
        role="status"
        className={cn("text-xs", check.canSave || tooFew ? "text-muted-foreground" : "text-destructive")}
        data-testid="property-split-status"
      >
        {draftStatus(check, amount)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          disabled={isSaving || tooFew}
          onClick={() => setRows(evenDraft(rows, totalCents))}
        >
          {L.splitEvenly}
        </Button>
        <LoadingButton
          type="submit"
          variant="primary"
          size="sm"
          className="min-h-[44px]"
          isLoading={isSaving}
          loadingText={L.saving}
          disabled={!check.canSave}
        >
          {L.save}
        </LoadingButton>
        <Button type="button" variant="ghost" size="sm" className="min-h-[44px]" disabled={isSaving} onClick={onCancel}>
          {L.cancel}
        </Button>
      </div>
    </form>
  );
}
