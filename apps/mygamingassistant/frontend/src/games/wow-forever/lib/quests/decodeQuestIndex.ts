import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { QuestIndex } from "@/games/wow-forever/types/quests/questIndex";
import type { QuestIndexEntry } from "@/games/wow-forever/types/quests/questIndexEntry";
import type { QuestIndexFile } from "@/games/wow-forever/types/quests/questIndexFile";
import { FACTION, type Faction } from "@/games/wow-forever/types/worldMap";

const FACTIONS: readonly string[] = [FACTION.alliance, FACTION.horde, FACTION.neutral];

function side(value: unknown): Faction {
  return typeof value === "string" && FACTIONS.includes(value) ? (value as Faction) : FACTION.neutral;
}

function col(file: QuestIndexFile, name: string): number {
  const at = file.columns.indexOf(name);
  if (at < 0) throw new Error(`questIndex.json has no "${name}" column`);
  return at;
}

/** Decodes the raw `questIndex.json` into typed entries. */
export function decodeQuestIndex(file: QuestIndexFile): QuestIndex {
  const at = {
    id: col(file, "id"),
    name: col(file, "name"),
    level: col(file, "level"),
    minLevel: col(file, "minLevel"),
    side: col(file, "side"),
    zoneId: col(file, "zoneId"),
    isNew: col(file, "isNew"),
  };

  const entries: QuestIndexEntry[] = file.quests.map((row) => {
    const name = row[at.name] != null ? String(row[at.name]) : null;
    return {
      id: Number(row[at.id]),
      name,
      level: Number(row[at.level]),
      minLevel: Number(row[at.minLevel]),
      side: side(row[at.side]),
      zoneId: row[at.zoneId] != null ? Number(row[at.zoneId]) : null,
      isNew: Boolean(row[at.isNew]),
      searchWords: name ? nameWords(normalizeItemName(name)) : [],
    };
  });

  return {
    clientBuild: file.clientBuild,
    entries,
    zones: file.zones,
    counts: file.counts,
  };
}
