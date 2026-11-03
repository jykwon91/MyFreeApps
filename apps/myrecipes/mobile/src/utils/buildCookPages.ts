import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import type { CookPage } from "../types/CookPage";
import { nonBlankSteps } from "./nonBlankSteps";
import { parseStepTimers } from "./parseStepTimers";

/** Ingredients first if there are any, then each step with text, then the end. */
export function buildCookPages(version: Pick<VersionResponse, "ingredients" | "steps">): CookPage[] {
  const steps = nonBlankSteps(version.steps);
  return [
    ...(version.ingredients.length > 0 ? [{ kind: "ingredients" as const }] : []),
    ...steps.map((step, index) => ({
      kind: "step" as const,
      id: step.id,
      instruction: step.instruction,
      timers: parseStepTimers(step.instruction),
      number: index + 1,
      total: steps.length,
    })),
    { kind: "done" as const },
  ];
}
