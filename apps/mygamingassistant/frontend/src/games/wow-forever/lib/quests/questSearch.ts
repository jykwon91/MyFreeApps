import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";

/**
 * True when every word in the query appears as a prefix of one of the entry's
 * search words. Order-insensitive.
 */
export function questMatchesQuery(entry: QuestIndexEntry, queryWords: string[]): boolean {
  if (queryWords.length === 0) return true;
  if (entry.searchWords.length === 0) return false;
  return queryWords.every((qw) => entry.searchWords.some((w) => w.startsWith(qw)));
}

/** Pre-processes a raw query string into lowercase words for matching. */
export function parseQuestQuery(raw: string): string[] {
  return nameWords(normalizeItemName(raw));
}
