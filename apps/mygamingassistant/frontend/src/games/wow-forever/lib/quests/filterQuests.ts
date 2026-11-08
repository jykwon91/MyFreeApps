import { questMatchesQuery, parseQuestQuery } from "@/games/wow-forever/lib/quests/questSearch";
import type { QuestFilter } from "@/games/wow-forever/types/quests/questFilter";
import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";

/** Returns the entries that match every active filter. */
export function filterQuests(entries: QuestIndexEntry[], filter: QuestFilter, seenIds: ReadonlySet<number>): QuestIndexEntry[] {
  const queryWords = parseQuestQuery(filter.q);

  return entries.filter((e) => {
    if (!questMatchesQuery(e, queryWords)) return false;
    if (filter.zoneId !== null && e.zoneId !== filter.zoneId) return false;
    if (filter.side !== null && e.side !== filter.side) return false;
    if (filter.minLevel !== null && e.level < filter.minLevel) return false;
    if (filter.maxLevel !== null && e.level > filter.maxLevel) return false;
    if (filter.isNew && !e.isNew) return false;
    if (filter.seenInGame && !seenIds.has(e.id)) return false;
    return true;
  });
}
