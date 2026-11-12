import type { EditableStepRow } from "../types/recipe/editable-step-row";
import type { StepInput } from "../types/recipe/step";

/** The steps that say something, trimmed, in order. */
export function stepInputs(rows: EditableStepRow[]): StepInput[] {
  return rows
    .filter((row) => row.instruction.trim() !== "")
    .map((row) => ({ instruction: row.instruction.trim() }));
}
