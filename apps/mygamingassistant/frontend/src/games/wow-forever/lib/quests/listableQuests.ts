import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";

/**
 * The quests the list shows: those with a name. A quest the Forever game files
 * list but nobody's client has named yet would only read "Quest #id" with no
 * level context worth browsing, so it stays out of the list (its page still opens by id).
 */
export function listableQuests(entries: readonly QuestIndexEntry[]): QuestIndexEntry[] {
  return entries.filter((e) => e.name !== null);
}
