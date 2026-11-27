import { Button, LoadingButton } from "@platform/ui";
import { formatCurrency } from "@/shared/utils/currency";
import { PROPERTY_SPLIT_LABELS as L } from "@mybookkeeper/api-client/constants/propertySplitLabels";
import type { TransactionPropertySplit } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplit";

export interface PropertySplitSummaryProps {
  splits: readonly TransactionPropertySplit[];
  propertyNames: ReadonlyMap<string, string>;
  isRemoving: boolean;
  onChange: () => void;
  onRemove: () => void;
}

/** Each property's share of a split transaction, with Change and Remove. */
export default function PropertySplitSummary({ splits, propertyNames, isRemoving, onChange, onRemove }: PropertySplitSummaryProps) {
  return (
    <div className="space-y-3" data-testid="property-split-summary">
      <p className="text-sm font-medium">{L.splitAcross(splits.length)}</p>
      <ul className="space-y-1 text-sm">
        {splits.map((split, index) => (
          <li key={split.property_id ?? `unassigned-${index}`} className="flex justify-between gap-2">
            <span className="truncate">{(split.property_id && propertyNames.get(split.property_id)) || L.unassignedShare}</span>
            <span className="tabular-nums">{formatCurrency(split.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{L.removeHelp}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" disabled={isRemoving} onClick={onChange}>
          {L.change}
        </Button>
        <LoadingButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          isLoading={isRemoving}
          loadingText={L.removing}
          onClick={onRemove}
        >
          {L.remove}
        </LoadingButton>
      </div>
    </div>
  );
}
