/** What the server's diff of two versions says (backend services/recipe/version_diff.py): ingredients match by lineage_key, steps by position. */
import type {
  DiffResponse,
  IngredientChange,
  IngredientSnapshot,
  StepChange,
} from "@myrecipes/api-client/types/recipe/diff";
import type { IngredientResponse } from "@myrecipes/api-client/types/recipe/ingredient";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

function snapshotOf({ name, quantity, unit, note }: IngredientResponse): IngredientSnapshot {
  return { name, quantity, unit, note };
}

function sameSnapshot(a: IngredientSnapshot, b: IngredientSnapshot): boolean {
  return a.name === b.name && a.quantity === b.quantity && a.unit === b.unit && a.note === b.note;
}

function ingredientChanges(from: IngredientResponse[], to: IngredientResponse[]): IngredientChange[] {
  const before = new Map(from.map((ingredient) => [ingredient.lineage_key, ingredient]));
  const after = new Map(to.map((ingredient) => [ingredient.lineage_key, ingredient]));
  const changes: IngredientChange[] = [];
  for (const [key, ingredient] of after) {
    const old = before.get(key);
    if (!old) changes.push({ lineage_key: key, change: "added", before: null, after: snapshotOf(ingredient) });
    else if (!sameSnapshot(snapshotOf(old), snapshotOf(ingredient))) {
      changes.push({ lineage_key: key, change: "changed", before: snapshotOf(old), after: snapshotOf(ingredient) });
    }
  }
  for (const [key, old] of before) {
    if (!after.has(key)) changes.push({ lineage_key: key, change: "removed", before: snapshotOf(old), after: null });
  }
  return changes;
}

function stepChanges(from: VersionResponse["steps"], to: VersionResponse["steps"]): StepChange[] {
  const before = new Map(from.map((step) => [step.position, step.instruction]));
  const after = new Map(to.map((step) => [step.position, step.instruction]));
  const positions = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  return positions.flatMap((position): StepChange[] => {
    const old = before.get(position) ?? null;
    const now = after.get(position) ?? null;
    if (old === now) return [];
    return [{ position, change: old === null ? "added" : now === null ? "removed" : "changed", before: old, after: now }];
  });
}

/** `from` is null for the first version, which has nothing before it: everything is added. */
export function diffVersions(from: VersionResponse | null, to: VersionResponse): DiffResponse {
  return {
    from_version_id: from?.id ?? null,
    from_version_number: from?.version_number ?? null,
    to_version_id: to.id,
    to_version_number: to.version_number,
    ingredient_changes: ingredientChanges(from?.ingredients ?? [], to.ingredients),
    step_changes: stepChanges(from?.steps ?? [], to.steps),
  };
}
