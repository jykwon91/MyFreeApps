import { RECIPES_MESSAGES } from "../constants/recipes";
import { formatVersionDate } from "./formatVersionDate";

/** "Last cooked Nov 11, 2026", or "Not cooked yet". */
export function lastCookedText(lastCookedAt: string | null): string {
  return lastCookedAt ? RECIPES_MESSAGES.lastCooked(formatVersionDate(lastCookedAt)) : RECIPES_MESSAGES.notCooked;
}
