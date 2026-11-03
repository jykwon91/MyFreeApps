import type { StepResponse } from "@myrecipes/api-client/types/recipe/step";
import { byPosition } from "./byPosition";

export function nonBlankSteps(steps: StepResponse[]): StepResponse[] {
  return byPosition(steps).filter((step) => step.instruction.trim().length > 0);
}
