import { normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { RecipeMatch } from "@/games/wow-forever/types/recipes/recipeMatch";

/** The key of the one recipe named exactly as searched (search ranks it first), or null when none or several are. */
export function exactRecipeMatch(matches: readonly RecipeMatch[], query: string): string | null {
  const name = normalizeItemName(query);
  if (name === "") return null;
  const exact = matches.filter((m) => m.viaReagent === null && m.entry.searchName === name);
  return exact.length === 1 ? (exact[0]?.entry.key ?? null) : null;
}
