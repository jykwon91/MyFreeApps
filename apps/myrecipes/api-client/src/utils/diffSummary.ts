import { VERSION_COPY } from "../constants/versions";
import type { DiffResponse } from "../types/recipe/diff";
import type { DiffSummary } from "../types/recipe/diff-summary";

/** The header of a diff: its two versions' labels and a count of what changed. */
export function diffSummary(diff: DiffResponse): DiffSummary {
  const fromLabel = diff.from_version_number === null ? VERSION_COPY.nothing : `v${diff.from_version_number}`;
  const toLabel = `v${diff.to_version_number}`;
  const ingredientCount = diff.ingredient_changes.length;
  const stepCount = diff.step_changes.length;
  const total = ingredientCount + stepCount;
  return {
    fromLabel,
    toLabel,
    title: `${fromLabel} ${VERSION_COPY.to} ${toLabel}`,
    ingredientCount,
    stepCount,
    total,
    isIdentical: total === 0,
    subtitle:
      total === 0
        ? VERSION_COPY.noDifferences
        : `${total} change${total === 1 ? "" : "s"} — ${ingredientCount} ingredient, ${stepCount} step.`,
  };
}
