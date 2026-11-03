import type { CookTimer } from "../types/CookTimer";

export function isCookTimer(value: unknown): value is CookTimer {
  if (typeof value !== "object" || value === null) return false;
  const timer = value as Partial<CookTimer>;
  return (
    typeof timer.id === "string" &&
    typeof timer.recipeId === "string" &&
    typeof timer.recipeTitle === "string" &&
    typeof timer.stepNumber === "number" &&
    typeof timer.seconds === "number" &&
    typeof timer.endsAt === "number"
  );
}
