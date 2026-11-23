import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button, FieldFeedback, fieldFeedbackAria } from "@platform/ui";
import {
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  INGREDIENT_UNIT_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import type { IngredientRowProblems } from "@myrecipes/api-client/types/recipe/ingredient-row-problems";
import type { EditableIngredientRow } from "@myrecipes/api-client/types/recipe/editable-ingredient-row";
import { TOUCH_TARGET } from "@/constants/touchTarget";
import IngredientRowFeedback from "@/features/recipes/IngredientRowFeedback";
import { ingredientControlId } from "@/features/recipes/rowControlIds";
import { useRowListFocus } from "@/features/recipes/useRowListFocus";

interface Props {
  rows: EditableIngredientRow[];
  /** What's wrong with each row, by the row's key. */
  problems: Record<string, IngredientRowProblems>;
  /** What's wrong with the list as a whole, for the Add button to carry. */
  listProblem?: string;
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
  problems,
  listProblem,
  disabled,
  onChange,
  onAdd,
  onRemove,
  onMove,
}: Props) {
  const addId = "add-ingredient";
  const { containerRef, announcement, add, remove, move } = useRowListFocus({
    noun: "ingredient",
    rowCount: rows.length,
    addButtonId: addId,
    onAdd,
    onRemove,
    onMove,
  });
  return (
    <div ref={containerRef} className="space-y-2">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {rows.map((row, idx) => (
        <div key={row.key}>
          <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            <input
              id={ingredientControlId(row.key, "name")}
              data-row-first=""
              aria-label="Ingredient name"
              {...fieldFeedbackAria({ id: ingredientControlId(row.key, "name"), error: problems[row.key]?.name })}
              placeholder="Ingredient"
              maxLength={INGREDIENT_NAME_MAX_LENGTH}
              value={row.name}
              disabled={disabled}
              onChange={(e) => onChange(row.key, { name: e.target.value })}
              className={`${INPUT} flex-1 min-w-[8rem]`}
            />
            <input
              id={ingredientControlId(row.key, "quantity")}
              aria-label="Quantity"
              {...fieldFeedbackAria({ id: ingredientControlId(row.key, "quantity"), error: problems[row.key]?.quantity })}
              placeholder="Qty"
              inputMode="decimal"
              value={row.quantity}
              disabled={disabled}
              onChange={(e) => onChange(row.key, { quantity: e.target.value })}
              className={`${INPUT} w-20`}
            />
            <input
              id={ingredientControlId(row.key, "unit")}
              aria-label="Unit"
              {...fieldFeedbackAria({ id: ingredientControlId(row.key, "unit"), error: problems[row.key]?.unit })}
              placeholder="Unit"
              maxLength={INGREDIENT_UNIT_MAX_LENGTH}
              value={row.unit}
              disabled={disabled}
              onChange={(e) => onChange(row.key, { unit: e.target.value })}
              className={`${INPUT} w-24`}
            />
            <input
              id={ingredientControlId(row.key, "note")}
              aria-label="Note"
              {...fieldFeedbackAria({ id: ingredientControlId(row.key, "note"), error: problems[row.key]?.note })}
              placeholder="Note"
              maxLength={INGREDIENT_NOTE_MAX_LENGTH}
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
                onClick={() => move(row.key, idx, -1)}
                className={`flex ${TOUCH_TARGET} items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30`}
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Move ingredient down"
                disabled={disabled || idx === rows.length - 1}
                onClick={() => move(row.key, idx, 1)}
                className={`flex ${TOUCH_TARGET} items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30`}
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Remove ingredient"
                disabled={disabled}
                onClick={() => remove(row.key, idx)}
                className={`flex ${TOUCH_TARGET} items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <IngredientRowFeedback rowKey={row.key} problems={problems[row.key]} />
        </div>
      ))}
      <Button
        id={addId}
        type="button"
        variant="secondary"
        size="sm"
        onClick={add}
        disabled={disabled}
        {...fieldFeedbackAria({ id: addId, error: listProblem })}
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Add ingredient
        </span>
      </Button>
      <FieldFeedback id={addId} error={listProblem} />
    </div>
  );
}
