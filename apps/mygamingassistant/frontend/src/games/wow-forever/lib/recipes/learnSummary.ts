import { RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

/**
 * One short phrase for the closed row: how you get the recipe ("Trainer", "Vendor · Drop", "World drop").
 * Null for a recipe Forever added that nothing teaches yet — the row shows the "Source unknown" chip instead.
 */
export function learnSummary(entry: Pick<RecipeEntry, "learn" | "recipeSources" | "sourceUnknown">): string | null {
  const { learn } = entry;
  if (learn.kind === "start") return RECIPES_TEXT.knownFromStart;
  if (entry.sourceUnknown) return null;
  if (learn.kind === "trainer") return RECIPES_TEXT.trainer;
  const s = entry.recipeSources;
  if (!s) return RECIPES_TEXT.noSourceListed;
  const kinds: string[] = [];
  if (s.vendors.length) kinds.push(RECIPES_TEXT.vendor);
  if (s.quests.length) kinds.push(RECIPES_TEXT.quest);
  if (s.drop) kinds.push(s.drop.world ? RECIPES_TEXT.worldDrop : RECIPES_TEXT.drop);
  if (s.containers.length || s.containerDrops.length || s.objectSpots.length) kinds.push(RECIPES_TEXT.container);
  return kinds.length ? kinds.join(" · ") : RECIPES_TEXT.noSourceListed;
}

/** The Professions page guide for a recipe's profession. */
export function professionGuideHref(profession: RecipeEntry["profession"]): string {
  return `/wow-forever/professions?p=${profession}`;
}
