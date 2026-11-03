/** The kind of change a diff entry represents. */
export type DiffChangeKind = "added" | "removed" | "changed";

/** The state of one ingredient on one side of a diff. */
export interface IngredientSnapshot {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
}

/** One ingredient-level difference between two versions, keyed by lineage. */
export interface IngredientChange {
  lineage_key: string;
  change: DiffChangeKind;
  before: IngredientSnapshot | null;
  after: IngredientSnapshot | null;
}

/** One step-level difference, matched by 1-based position. */
export interface StepChange {
  position: number;
  change: DiffChangeKind;
  before: string | null;
  after: string | null;
}

/** The full diff from one version to another (default: parent -> this). */
export interface DiffResponse {
  from_version_id: string | null;
  from_version_number: number | null;
  to_version_id: string;
  to_version_number: number;
  ingredient_changes: IngredientChange[];
  step_changes: StepChange[];
}
