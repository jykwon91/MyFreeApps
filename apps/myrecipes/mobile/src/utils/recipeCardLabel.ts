import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { versionBadgeLabel } from "@myrecipes/api-client/utils/versionBadgeLabel";
import { lastCookedText } from "./lastCookedText";
import { ratingLabel } from "./ratingLabel";
import { recipeCardFacts } from "./recipeCardFacts";

/** What the whole card says to a screen reader: the title, then each fact the card shows, in the order shown. */
export function recipeCardLabel(recipe: RecipeSummary): string {
  const { versions, owner } = recipeCardFacts(recipe);
  const parts = [recipe.title, versionBadgeLabel(recipe.latest_version_number), versions];
  if (recipe.is_owner) parts.push(ratingLabel(recipe.best_rating), lastCookedText(recipe.last_cooked_at));
  parts.push(owner);
  return parts.filter(Boolean).join(", ");
}
