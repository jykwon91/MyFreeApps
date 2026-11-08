import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";

/** The decoded quest index (all quests the Forever client has). */
export interface QuestIndex {
  clientBuild: string;
  entries: QuestIndexEntry[];
  /** [zoneId, zoneName] pairs for every zone that has at least one quest, sorted by name. */
  zones: readonly [number, string][];
  counts: {
    total: number;
    named: number;
    withClassic: number;
    seenInGame: number;
    unnamed: number;
  };
}
