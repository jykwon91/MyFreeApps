import sourcesJson from "@/games/wow-forever/data/food/classic/recipeSources.json";
import { createSourceLookup, type RawSourcesFile, type SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";

/**
 * Where recipes and reagents come from — vendors, quests, drops, fishing,
 * containers. GENERATED from cmangos classic-db (GPL-3.0, Classic values that
 * may differ in Forever) by `python -m scripts.wow_food.build`.
 */
const SOURCES = createSourceLookup(sourcesJson as unknown as RawSourcesFile);

/** The whole lookup, for components that take any profession's sources. */
export const FOOD_SOURCES: SourceLookup = SOURCES;

/** e.g. "cmangos/classic-db@ec4f596…". */
export const RECIPE_SOURCE_DATA: string = SOURCES.source;

/** Where to get the recipe for this cooked item (keyed by the food's id). */
export function recipeSourcesFor(foodId: number): ItemSources {
  return SOURCES.recipe(foodId);
}

/** Where to get a reagent. */
export function reagentSourcesFor(itemId: number): ItemSources {
  return SOURCES.reagent(itemId);
}
