/**
 * Forever's own dungeons' quests, from the Forever quest build's
 * `dungeons/foreverDungeonQuests.json` (Blizzard's Game Data API — the source
 * of truth), with the level from `quests/questSeen.json` when the operator's
 * client has seen the quest. Nothing else is taken from the client.
 */
import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import { numberOrNull, rows, side, stringOrNull } from "@/games/wow-forever/lib/quests/questRowDecode";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";
import type { ForeverQuestSeen } from "@/games/wow-forever/types/dungeons/foreverQuestSeen";

const QUESTS_FILE = "foreverDungeonQuests.json";
const SEEN_FILE = "questSeen.json";
const QUEST_COLUMNS = [
  "id", "title", "side", "type", "repeatable", "classes", "needsReputation",
  "xp", "money", "reputations", "items", "itemsChoice", "spell", "description",
] as const;
const SEEN_COLUMNS = ["level", "minLevel", "seenOn"] as const;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

/** Seen quests first, lowest level first; then the rest; title breaks ties. */
function byLevelThenTitle(a: ForeverDungeonQuest, b: ForeverDungeonQuest): number {
  const level = a.seen && b.seen ? a.seen.level - b.seen.level : Number(!a.seen) - Number(!b.seen);
  return level || a.title.localeCompare(b.title);
}

/** Turns the files into each new Forever dungeon's quests (none for any other instance). */
export function decodeForeverDungeonQuests(
  files: Pick<DungeonDataFiles, "foreverQuests" | "questSeen">,
): (instanceId: number) => ForeverDungeonQuest[] {
  const col = columnIndexes(QUESTS_FILE, files.foreverQuests.columns, QUEST_COLUMNS);
  const seenCol = columnIndexes(SEEN_FILE, files.questSeen.columns, SEEN_COLUMNS);

  // A seen row missing any of these is skipped: no level is better than a made-up one.
  const seen = (id: number): ForeverQuestSeen | null => {
    const row = files.questSeen.quests[String(id)];
    if (!row) return null;
    const level = numberOrNull(row[seenCol.level]);
    const minLevel = numberOrNull(row[seenCol.minLevel]);
    const seenOn = stringOrNull(row[seenCol.seenOn]);
    if (level === null || minLevel === null || seenOn === null) return null;
    return { level, minLevel, seenOn };
  };

  const quest = (row: readonly unknown[]): ForeverDungeonQuest => {
    const id = Number(row[col.id]);
    const items = rows(row[col.items]).map(([itemId, name]) => ({ id: Number(itemId), name: String(name), count: 1 }));
    return {
      id,
      title: String(row[col.title]),
      side: side(row[col.side]),
      type: stringOrNull(row[col.type]),
      repeatable: row[col.repeatable] === true,
      classes: strings(row[col.classes]),
      needsReputation: rows(row[col.needsReputation]).map(([faction, standing]) => ({ faction: String(faction), standing: String(standing) })),
      xp: Number(row[col.xp]),
      money: Number(row[col.money]),
      reputations: rows(row[col.reputations]).map(([faction, amount]) => ({ faction: String(faction), amount: Number(amount) })),
      items,
      // A "choice" of one item is just that item.
      itemsChoice: row[col.itemsChoice] === true && items.length > 1,
      spell: stringOrNull(row[col.spell]),
      description: String(row[col.description] ?? ""),
      seen: seen(id),
    };
  };

  return (instanceId) => (files.foreverQuests.quests[String(instanceId)] ?? []).map(quest).sort(byLevelThenTitle);
}
