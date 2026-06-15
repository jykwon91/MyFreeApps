import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@platform/ui";
import type { EditableIngredientRow } from "@/features/recipes/editor-types";

interface Props {
  rows: EditableIngredientRow[];
  disabled?: boolean;
  onChange: (key: string, patch: Partial<EditableIngredientRow>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
}

const INPUT =
  "rounded-md border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 min-h-[44px]";

/**
 * Dynamic ingredient rows: name (required), quantity, unit, note, with
 * add / remove / reorder controls. Each row preserves its lineage_key (held in
 * parent state) so a tweak's diff tracks changes to the same ingredient.
 */
export default function IngredientRows({
  rows,
  disabled,
  onChange,
  onAdd,
  onRemove,
  onMove,
}: Props) {
  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <div key={row.key} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
          <input
            aria-label="Ingredient name"
            placeholder="Ingredient"
            value={row.name}
            disabled={disabled}
            onChange={(e) => onChange(row.key, { name: e.target.value })}
            className={`${INPUT} flex-1 min-w-[8rem]`}
          />
          <input
            aria-label="Quantity"
            placeholder="Qty"
            inputMode="decimal"
            value={row.quantity}
            disabled={disabled}
            onChange={(e) => onChange(row.key, { quantity: e.target.value })}
            className={`${INPUT} w-20`}
          />
          <input
            aria-label="Unit"
            placeholder="Unit"
            value={row.unit}
            disabled={disabled}
            onChange={(e) => onChange(row.key, { unit: e.target.value })}
            className={`${INPUT} w-24`}
          />
          <input
            aria-label="Note"
            placeholder="Note"
            value={row.note}
            disabled={disabled}
            onChange={(e) => onChange(row.key, { note: e.target.value })}
            className={`${INPUT} flex-1 min-w-[6rem]`}
          />
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Move ingredient up"
              disabled={disabled || idx === 0}
              onClick={() => onMove(row.key, -1)}
              className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Move ingredient down"
              disabled={disabled || idx === rows.length - 1}
              onClick={() => onMove(row.key, 1)}
              className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Remove ingredient"
              disabled={disabled}
              onClick={() => onRemove(row.key)}
              className="flex h-11 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={onAdd} disabled={disabled}>
        <span className="inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Add ingredient
        </span>
      </Button>
    </div>
  );
}
