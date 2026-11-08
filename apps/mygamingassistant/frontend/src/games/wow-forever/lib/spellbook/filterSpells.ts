import type { SpellbookFilterResult } from "@/games/wow-forever/types/spellbook/spellbookFilterResult";
import type { SpellbookFilters } from "@/games/wow-forever/types/spellbook/spellbookFilters";
import type { SpellbookSpell } from "@/games/wow-forever/types/spellbook/spellbookSpell";
import { matchesAll, queryTokens } from "@/games/wow-forever/worldMap/searchText";

/** A rank you can learn at `level` — a spell with no known level never counts as learnable yet. */
function learnableBy(spell: SpellbookSpell, level: number): boolean {
  return spell.firstLevel !== null && spell.firstLevel <= level;
}

/**
 * The spells the filters keep (the file's order: tab, then first learn level), and the count each chip
 * shows: a tab chip counts that tab with the other filters on, the "different" chip counts with the tab on.
 */
export function filterSpells(spells: readonly SpellbookSpell[], filters: SpellbookFilters): SpellbookFilterResult {
  const tokens = queryTokens(filters.query);
  const base = spells.filter(
    (s) =>
      (tokens.length === 0 || matchesAll(tokens, s.searchText)) &&
      (filters.level === null || learnableBy(s, filters.level)),
  );
  const inTab = filters.tab === null ? base : base.filter((s) => s.tab === filters.tab);
  const byDifference = filters.differentOnly ? base.filter((s) => s.change !== null) : base;
  const tabCounts = new Map<number, number>();
  for (const s of byDifference) tabCounts.set(s.tab, (tabCounts.get(s.tab) ?? 0) + 1);
  return {
    spells: filters.differentOnly ? inTab.filter((s) => s.change !== null) : inTab,
    tabCounts,
    allTabsCount: byDifference.length,
    differentCount: inTab.filter((s) => s.change !== null).length,
  };
}
