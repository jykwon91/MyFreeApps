import { CLASS_TAGGED_CATEGORIES } from "@/games/wow-forever/data/changes/changeCategories";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";
import type { ChangeFilters } from "@/games/wow-forever/types/changes/changeFilters";
import { queryTokens } from "@/games/wow-forever/worldMap/searchText";

/**
 * The rows that pass every filter, in the order given. A class keeps only rows
 * tagged with it, and only in a class-tagged category (quests and zones have no
 * class, so it doesn't apply there); the search needs every word in the name or
 * summary, in any order; "since last build" keeps rows whose content first
 * appeared in `build`.
 */
export function filterChanges(entries: readonly ChangeEntry[], filters: ChangeFilters, build: string): ChangeEntry[] {
  const tokens = queryTokens(filters.query);
  const classId = CLASS_TAGGED_CATEGORIES.has(filters.category) ? filters.classId : null;
  return entries.filter(
    (entry) =>
      entry.category === filters.category &&
      (classId === null || entry.classes.includes(classId)) &&
      tokens.every((token) => entry.searchText.includes(token)) &&
      (!filters.sinceLastBuild || entry.since === build),
  );
}
