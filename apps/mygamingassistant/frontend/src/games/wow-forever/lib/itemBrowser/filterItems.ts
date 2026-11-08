import { matchesNameWords, nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import { ITEM_CHANGE } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";
import type { ItemBrowserFilters } from "@/games/wow-forever/types/itemBrowser/itemBrowserFilters";
import { ITEM_FACET, type ItemFacet } from "@/games/wow-forever/types/itemBrowser/itemFacet";
import type { ItemFilterResult } from "@/games/wow-forever/types/itemBrowser/itemFilterResult";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

const FACETS: readonly ItemFacet[] = Object.values(ITEM_FACET);

function inRange(value: number, min: number | null, max: number | null): boolean {
  return (min === null || value >= min) && (max === null || value <= max);
}

function picked<T extends string>(chosen: readonly T[], value: T | null): boolean {
  return chosen.length === 0 || (value !== null && chosen.includes(value));
}

/** The item's value for each chip group (null = it has no chip there: no type, or unchanged). */
function facetValue(item: ItemIndexEntry, facet: ItemFacet): string | null {
  switch (facet) {
    case ITEM_FACET.quality:
      return item.quality;
    case ITEM_FACET.group:
      return item.group;
    case ITEM_FACET.slot:
      return item.slot;
    case ITEM_FACET.type:
      return item.itemType;
    case ITEM_FACET.change:
      return item.change === ITEM_CHANGE.none ? null : item.change;
  }
}

function passesFacet(item: ItemIndexEntry, facet: ItemFacet, filters: ItemBrowserFilters): boolean {
  switch (facet) {
    case ITEM_FACET.quality:
      return picked(filters.qualities, item.quality);
    case ITEM_FACET.group:
      return picked(filters.groups, item.group);
    case ITEM_FACET.slot:
      return picked(filters.slots, item.slot);
    case ITEM_FACET.type:
      return picked(filters.types, item.itemType);
    case ITEM_FACET.change:
      return filters.changes.length === 0 || (item.change !== ITEM_CHANGE.none && filters.changes.includes(item.change));
  }
}

function passesLevels(item: ItemIndexEntry, filters: ItemBrowserFilters): boolean {
  return (
    inRange(item.requiredLevel, filters.requiredMin, filters.requiredMax) &&
    inRange(item.itemLevel, filters.itemLevelMin, filters.itemLevelMax)
  );
}

function run(items: readonly ItemIndexEntry[], filters: ItemBrowserFilters, tokens: readonly string[], fuzzy: boolean) {
  const shown: ItemIndexEntry[] = [];
  let nameMatches = 0;
  const counts = Object.fromEntries(FACETS.map((f) => [f, new Map<string, number>()])) as Record<ItemFacet, Map<string, number>>;
  for (const item of items) {
    if (!passesLevels(item, filters)) continue;
    if (tokens.length > 0 && !matchesNameWords(tokens, item.searchWords, fuzzy)) continue;
    nameMatches += 1;
    const passes = FACETS.map((f) => passesFacet(item, f, filters));
    const failed = passes.filter((p) => !p).length;
    if (failed === 0) shown.push(item);
    if (failed > 1) continue;
    // Count the item under a group's chip when it passes every OTHER group.
    FACETS.forEach((facet, i) => {
      if (failed === 1 && passes[i]) return;
      const value = facetValue(item, facet);
      if (value === null) return;
      const map = counts[facet];
      map.set(value, (map.get(value) ?? 0) + 1);
    });
  }
  return { shown, counts, nameMatches };
}

/**
 * The items the filters keep (in index order) and the chip counts. The name
 * search matches every word in any order; one-letter-off matching only runs
 * when no item's name matches exactly (within the level ranges) — names the
 * chips hide still count as matches, so picking a chip never swaps in near misses.
 */
export function filterItems(items: readonly ItemIndexEntry[], filters: ItemBrowserFilters): ItemFilterResult {
  const tokens = nameWords(normalizeItemName(filters.query));
  const exact = run(items, filters, tokens, false);
  if (exact.nameMatches > 0 || tokens.length === 0) return { items: exact.shown, fuzzy: false, counts: exact.counts };
  const loose = run(items, filters, tokens, true);
  return { items: loose.shown, fuzzy: loose.shown.length > 0, counts: loose.counts };
}
