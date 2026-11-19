import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import { numberOrNull, rows, stringOrNull } from "@/games/wow-forever/lib/quests/questRowDecode";
import type { TurnInSpot } from "@/games/wow-forever/types/dungeons/turnInSpot";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";

const QUEST_COLS = ["id", "givers", "enders"] as const;
const GIVER_COLS = ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"] as const;

/**
 * Where each quest is turned in, by quest id: its one ender, placed where that same NPC (by id, not
 * name) stands as a quest giver somewhere in the data. Quests with several enders, or an ender that
 * never gives a quest out in the world, are left out: we don't know where to send you.
 */
export function turnInSpots(shards: readonly QuestDetailFile[], zoneNames: ReadonlyMap<number, string>): Map<number, TurnInSpot> {
  const placed = new Map<string, TurnInSpot>();
  const enders: [number, string][] = [];
  for (const shard of shards) {
    const col = columnIndexes("questShard", shard.questColumns, QUEST_COLS);
    const giverCol = columnIndexes("questShard", shard.giverColumns, GIVER_COLS);
    for (const row of Object.values(shard.quests)) {
      const ender = Array.isArray(row[col.enders]) ? (row[col.enders] as unknown[]) : [];
      if (ender.length === 1 && typeof ender[0] === "string") enders.push([Number(row[col.id]), ender[0]]);
      for (const g of rows(row[col.givers])) {
        const zoneId = numberOrNull(g[giverCol.zone]);
        const x = numberOrNull(g[giverCol.x]);
        const y = numberOrNull(g[giverCol.y]);
        const zoneName = zoneId === null ? undefined : zoneNames.get(zoneId);
        const key = `${String(g[giverCol.kind])}:${Number(g[giverCol.id])}`;
        if (zoneId === null || x === null || y === null || !zoneName || g[giverCol.instance] != null || placed.has(key)) continue;
        placed.set(key, { name: String(g[giverCol.name]), zoneId, zoneName, subzone: stringOrNull(g[giverCol.subzone]), x, y });
      }
    }
  }
  const out = new Map<number, TurnInSpot>();
  for (const [questId, key] of enders) {
    const spot = placed.get(key);
    if (spot) out.set(questId, spot);
  }
  return out;
}
