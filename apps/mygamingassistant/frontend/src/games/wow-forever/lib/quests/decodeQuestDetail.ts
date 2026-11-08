/**
 * Decodes a quest from its classic shard and seen overlay into a `DungeonQuest`.
 *
 * Re-uses the `DungeonQuest` type since the data format is identical —
 * the shard columns match `dungeons/classic/dungeonQuests.json` exactly.
 * The `insideDungeon` field on givers and objectives will be `false` for
 * world-only quests; for dungeon quests the detail page can note it.
 */
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import type { QuestPageResult } from "@/games/wow-forever/types/quests/questPageResult";
import type { QuestChainStep } from "@/games/wow-forever/types/dungeons/questChainStep";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestObjective } from "@/games/wow-forever/types/dungeons/questObjective";
import type { QuestReward } from "@/games/wow-forever/types/dungeons/questReward";
import { QUEST_TARGET_KIND, type QuestTargetKind } from "@/games/wow-forever/types/dungeons/questTargetKind";
import type { QuestDetailFile } from "@/games/wow-forever/types/quests/questDetailFile";
import type { QuestSeenFile } from "@/games/wow-forever/types/quests/questSeenFile";
import { FACTION, type Faction, type WorldZone } from "@/games/wow-forever/types/worldMap";

const QUEST_COLS = ["id", "title", "level", "minLevel", "side", "classes", "givers", "chain", "objectives", "rewards", "choices", "enders"] as const;
const SEEN_COLS = ["title", "level", "minLevel", "objectives", "rewards", "choices"] as const;
const GIVER_COLS = ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"] as const;
const OBJ_COLS = ["kind", "id", "count"] as const;
const TARGET_COLS = ["name", "instance"] as const;

const TARGET_KINDS: readonly string[] = Object.values(QUEST_TARGET_KIND);
const FACTIONS: readonly string[] = [FACTION.alliance, FACTION.horde, FACTION.neutral];

type Row = readonly unknown[];

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((r): r is Row => Array.isArray(r)) : [];
}

function targetKind(value: unknown): QuestTargetKind | null {
  return typeof value === "string" && TARGET_KINDS.includes(value) ? (value as QuestTargetKind) : null;
}

function side(value: unknown): Faction {
  return typeof value === "string" && FACTIONS.includes(value) ? (value as Faction) : FACTION.neutral;
}

function classIds(value: unknown): WowClassId[] {
  return String(value ?? "")
    .split(",")
    .flatMap((id) => findClass(id)?.id ?? []);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Decodes a single quest from the shard and seen overlay.
 * A quest new in Forever has no Classic row; if it's been seen in game it is built from the
 * seen row alone (no givers, chain or enders). Returns `null` when neither source has it.
 */
export function decodeQuestDetail(
  questId: number,
  shard: QuestDetailFile,
  seen: QuestSeenFile,
  zones: ReadonlyMap<number, WorldZone>,
  items: ReadonlyMap<number, { name: string; slot: string }>,
): QuestPageResult | null {
  const doc = shard;
  const col = columnIndexes("questShard", doc.questColumns, QUEST_COLS);
  const seenCol = columnIndexes("questSeen", seen.columns, SEEN_COLS);
  const giverCol = columnIndexes("questShard", doc.giverColumns, GIVER_COLS);
  const objCol = columnIndexes("questShard", doc.objectiveColumns, OBJ_COLS);
  const targetCol = columnIndexes("questShard", doc.targetColumns, TARGET_COLS);

  const row = doc.quests[String(questId)] ?? null;
  const seenRow = seen.quests[String(questId)] ?? null;
  if (!row && !seenRow) return null;

  const target = (key: string): { name: string; instance: number | null } | null => {
    const r = doc.targets[key];
    return r ? { name: String(r[targetCol.name]), instance: numberOrNull(r[targetCol.instance]) } : null;
  };

  const decodeObjectives = (value: unknown): QuestObjective[] =>
    rows(value).flatMap((o) => {
      const kind = targetKind(o[objCol.kind]);
      const found = kind ? target(`${kind}:${Number(o[objCol.id])}`) : null;
      if (!kind || !found) return [];
      return [{ kind, name: found.name, count: Number(o[objCol.count]), insideDungeon: found.instance !== null }];
    });

  const decodeRewards = (value: unknown): QuestReward[] =>
    rows(value).flatMap(([id, count]) => {
      const item = items.get(Number(id));
      return item ? [{ id: Number(id), name: item.name, count: Number(count) }] : [];
    });

  let dungeonInstanceId: number | null = null;
  const decodeGivers = (value: unknown): QuestGiver[] =>
    rows(value).flatMap((g) => {
      const kind = targetKind(g[giverCol.kind]);
      if (!kind) return [];
      const zoneId = numberOrNull(g[giverCol.zone]);
      const x = numberOrNull(g[giverCol.x]);
      const y = numberOrNull(g[giverCol.y]);
      const place =
        zoneId !== null && x !== null && y !== null
          ? { zoneId, zoneName: zones.get(zoneId)?.name ?? "", subzone: String(g[giverCol.subzone] ?? ""), x, y }
          : null;
      const instanceId = numberOrNull(g[giverCol.instance]);
      const insideDungeon = instanceId !== null;
      if (insideDungeon && dungeonInstanceId === null) dungeonInstanceId = instanceId;
      return [{ kind, name: String(g[giverCol.name]), place, insideDungeon }];
    });

  const chainStep = (id: number): QuestChainStep[] => {
    const r = doc.quests[String(id)];
    if (!r) return [];
    const s = seen.quests[String(id)] ?? null;
    const [giver] = rows(r[col.givers]);
    return [
      {
        id,
        title: String(s ? s[seenCol.title] : r[col.title]),
        level: Number(s ? s[seenCol.level] : r[col.level]),
        giver: giver ? String(giver[giverCol.name]) : null,
      },
    ];
  };

  if (!row) {
    const s = seenRow as Row;
    return {
      id: questId,
      title: String(s[seenCol.title]),
      level: Number(s[seenCol.level]),
      minLevel: Number(s[seenCol.minLevel]),
      side: FACTION.neutral,
      classes: [],
      givers: [],
      chain: [],
      objectives: decodeObjectives(s[seenCol.objectives]),
      rewards: decodeRewards(s[seenCol.rewards]),
      choices: decodeRewards(s[seenCol.choices]),
      enders: [],
      seenOn: seen.seenOn,
      dungeonInstanceId: null,
    };
  }

  const givers = decodeGivers(row[col.givers]);
  return {
    id: questId,
    title: String(seenRow ? seenRow[seenCol.title] : row[col.title]),
    level: Number(seenRow ? seenRow[seenCol.level] : row[col.level]),
    minLevel: Number(seenRow ? seenRow[seenCol.minLevel] : row[col.minLevel]),
    side: side(row[col.side]),
    classes: classIds(row[col.classes]),
    givers,
    chain: (Array.isArray(row[col.chain]) ? (row[col.chain] as unknown[]) : []).flatMap((c) => chainStep(Number(c))),
    objectives: decodeObjectives(seenRow ? seenRow[seenCol.objectives] : row[col.objectives]),
    rewards: decodeRewards(seenRow ? seenRow[seenCol.rewards] : row[col.rewards]),
    choices: decodeRewards(seenRow ? seenRow[seenCol.choices] : row[col.choices]),
    enders: (Array.isArray(row[col.enders]) ? (row[col.enders] as unknown[]) : []).flatMap(
      (k) => target(String(k))?.name ?? [],
    ),
    seenOn: seenRow ? seen.seenOn : null,
    dungeonInstanceId,
  };
}
