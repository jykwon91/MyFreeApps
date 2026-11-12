import type { DiffResponse } from "@myrecipes/api-client/types/recipe/diff";
import { ingredientChangeLine } from "@myrecipes/api-client/utils/ingredientChangeLine";
import type { DiffLines } from "../types/DiffLines";

/** A diff's ingredient and step changes as text, keyed as the website keys them. */
export function diffLines(diff: DiffResponse): DiffLines {
  return {
    ingredients: diff.ingredient_changes.map((change) => ({
      key: change.lineage_key,
      change: change.change,
      before: ingredientChangeLine(change, "before"),
      after: ingredientChangeLine(change, "after"),
    })),
    steps: diff.step_changes.map((change) => ({
      key: `${change.position}-${change.change}`,
      change: change.change,
      before: change.before,
      after: change.after,
    })),
  };
}
