import { RECIPE_CARD_COPY } from "@myrecipes/api-client/constants/recipeCardCopy";
import { formatVersionDate } from "./formatVersionDate";

/** "Last cooked Nov 11, 2026", or "Not cooked yet". */
export function lastCookedText(lastCookedAt: string | null): string {
  return lastCookedAt ? RECIPE_CARD_COPY.lastCooked(formatVersionDate(lastCookedAt)) : RECIPE_CARD_COPY.notCooked;
}
