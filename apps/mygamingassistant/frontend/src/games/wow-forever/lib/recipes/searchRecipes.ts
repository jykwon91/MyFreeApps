import { matchesNameWords, nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { RecipeFilters } from "@/games/wow-forever/types/recipes/recipeFilters";
import type { RecipeMatch } from "@/games/wow-forever/types/recipes/recipeMatch";

/** Best first: the exact name, a name that starts with it, the name's words, the recipe item, an ingredient by its exact name, then by its words, a one-letter typo. */
const RANK = { exact: 0, prefix: 1, name: 2, recipeItem: 3, reagentExact: 4, reagent: 5, typo: 6 } as const;

interface Ranked extends RecipeMatch {
  rank: number;
}

function rankEntry(entry: RecipeEntry, query: string, tokens: readonly string[]): Ranked | null {
  if (entry.searchName === query) return { entry, viaReagent: null, rank: RANK.exact };
  if (entry.searchName.startsWith(query)) return { entry, viaReagent: null, rank: RANK.prefix };
  if (matchesNameWords(tokens, entry.nameWords, false)) return { entry, viaReagent: null, rank: RANK.name };
  if (matchesNameWords(tokens, entry.recipeItemWords, false)) return { entry, viaReagent: null, rank: RANK.recipeItem };
  const exactReagent = entry.reagents.find((r) => normalizeItemName(r.name) === query);
  if (exactReagent) return { entry, viaReagent: exactReagent.name, rank: RANK.reagentExact };
  const reagent = entry.reagentWords.findIndex((w) => matchesNameWords(tokens, w, false));
  if (reagent >= 0) return { entry, viaReagent: entry.reagents[reagent]?.name ?? null, rank: RANK.reagent };
  if (matchesNameWords(tokens, entry.nameWords, true)) return { entry, viaReagent: null, rank: RANK.typo };
  return null;
}

function bySkillThenName(a: RecipeEntry, b: RecipeEntry): number {
  return a.skill - b.skill || a.name.localeCompare(b.name);
}

function inFilters(entry: RecipeEntry, filters: RecipeFilters): boolean {
  return (filters.profession === undefined || entry.profession === filters.profession) && (filters.category === undefined || entry.category === filters.category);
}

/** The recipes the search and filters pick, best match first (lowest skill first within a rank). */
export function searchRecipes(entries: readonly RecipeEntry[], filters: RecipeFilters): RecipeMatch[] {
  const pool = entries.filter((e) => inFilters(e, filters));
  const query = normalizeItemName(filters.query);
  if (query === "") return [...pool].sort(bySkillThenName).map((entry) => ({ entry, viaReagent: null }));
  const tokens = nameWords(query);
  const ranked: Ranked[] = [];
  for (const entry of pool) {
    const hit = rankEntry(entry, query, tokens);
    if (hit) ranked.push(hit);
  }
  ranked.sort((a, b) => a.rank - b.rank || bySkillThenName(a.entry, b.entry));
  return ranked.map(({ entry, viaReagent }) => ({ entry, viaReagent }));
}

/** True when there's something to list: a query, a profession or a category. */
export function hasRecipeSearch(filters: RecipeFilters): boolean {
  return filters.query.trim() !== "" || filters.profession !== undefined || filters.category !== undefined;
}
