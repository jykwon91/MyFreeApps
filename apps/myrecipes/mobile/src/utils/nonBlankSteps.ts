import type { RecipeStepLine } from "../types/RecipeStepLine";
import { byPosition } from "./byPosition";

export function nonBlankSteps<T extends RecipeStepLine>(steps: readonly T[]): T[] {
  return byPosition(steps).filter((step) => step.instruction.trim().length > 0);
}
