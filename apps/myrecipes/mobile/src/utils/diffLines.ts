import { VERSION_DIFF_FIELD_LABELS } from "@myrecipes/api-client/constants/versions";
import type { DiffResponse } from "@myrecipes/api-client/types/recipe/diff";
import { fieldChangeValue } from "@myrecipes/api-client/utils/fieldChangeValue";
import { ingredientChangeLine } from "@myrecipes/api-client/utils/ingredientChangeLine";
import { deviceDecimalSeparator } from "@platform/mobile";
import type { DiffLines } from "../types/DiffLines";

/** A diff's servings/time, ingredient and step changes as text, keyed as the website keys them. */
export function diffLines(diff: DiffResponse): DiffLines {
  const decimalSeparator = deviceDecimalSeparator();
  return {
    fields: diff.field_changes.map((change) => ({
      key: change.field,
      change: "changed",
      label: VERSION_DIFF_FIELD_LABELS[change.field],
      before: fieldChangeValue(change, "before"),
      after: fieldChangeValue(change, "after"),
    })),
    // An older version can repeat a lineage key, so the index keeps each row's key unique.
    ingredients: diff.ingredient_changes.map((change, index) => ({
      key: `${index}-${change.lineage_key}`,
      change: change.change,
      before: ingredientChangeLine(change, "before", decimalSeparator),
      after: ingredientChangeLine(change, "after", decimalSeparator),
    })),
    steps: diff.step_changes.map((change) => ({
      key: `${change.position}-${change.change}`,
      change: change.change,
      before: change.before,
      after: change.after,
    })),
  };
}
