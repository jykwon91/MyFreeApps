/**
 * Each dungeon's quests, from the dungeon generator's `dungeons/classic/dungeonQuests.json`
 * (cmangos Classic data, only quests the Forever client has) and
 * `dungeons/dungeonQuestsSeen.json` (what the operator's own Forever client
 * says about the quests it has seen — preferred for title, levels, objectives
 * and rewards).
 */
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { LootItemInfo } from "@/games/wow-forever/types/dungeons/lootItemInfo";
import type { QuestChainStep } from "@/games/wow-forever/types/dungeons/questChainStep";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestObjective } from "@/games/wow-forever/types/dungeons/questObjective";
import type { QuestReward } from "@/games/wow-forever/types/dungeons/questReward";
import { QUEST_TARGET_KIND, type QuestTargetKind } from "@/games/wow-forever/types/dungeons/questTargetKind";
import { FACTION, type Faction, type WorldZone } from "@/games/wow-forever/types/worldMap";

const QUESTS_FILE = "dungeonQuests.json";
const SEEN_FILE = "dungeonQuestsSeen.json";
const QUEST_COLUMNS = ["id", "title", "level", "minLevel", "side", "classes", "givers", "chain", "objectives", "rewards", "choices", "enders"] as const;
const SEEN_COLUMNS = ["title", "level", "minLevel", "objectives", "rewards", "choices"] as const;
const GIVER_COLUMNS = ["kind", "id", "name", "zone", "subzone", "x", "y", "instance"] as const;
const OBJECTIVE_COLUMNS = ["kind", "id", "count"] as const;
const TARGET_COLUMNS = ["name", "instance"] as const;

const TARGET_KINDS: readonly string[] = Object.values(QUEST_TARGET_KIND);
const SIDES: readonly string[] = [FACTION.alliance, FACTION.horde, FACTION.neutral];

type Row = readonly unknown[];

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((r): r is Row => Array.isArray(r)) : [];
}

function targetKind(value: unknown): QuestTargetKind | null {
  return typeof value === "string" && TARGET_KINDS.includes(value) ? (value as QuestTargetKind) : null;
}

function side(value: unknown): Faction {
  return typeof value === "string" && SIDES.includes(value) ? (value as Faction) : FACTION.neutral;
}

function classIds(value: unknown): WowClassId[] {
  return String(value ?? "")
    .split(",")
    .flatMap((id) => findClass(id)?.id ?? []);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Turns the files into quests per instance; each quest is decoded once and shared between the pages that list it. */
export function decodeDungeonQuests(
  files: Pick<DungeonDataFiles, "quests" | "seenQuests">,
  items: ReadonlyMap<number, LootItemInfo>,
  zones: ReadonlyMap<number, WorldZone>,
): (instanceId: number) => DungeonQuest[] {
  const doc = files.quests;
  const col = columnIndexes(QUESTS_FILE, doc.questColumns, QUEST_COLUMNS);
  const seenCol = columnIndexes(SEEN_FILE, files.seenQuests.columns, SEEN_COLUMNS);
  const giverCol = columnIndexes(QUESTS_FILE, doc.giverColumns, GIVER_COLUMNS);
  const objCol = columnIndexes(QUESTS_FILE, doc.objectiveColumns, OBJECTIVE_COLUMNS);
  const targetCol = columnIndexes(QUESTS_FILE, doc.targetColumns, TARGET_COLUMNS);

  const target = (key: string): { name: string; instance: number | null } | null => {
    const row = doc.targets[key];
    return row ? { name: String(row[targetCol.name]), instance: numberOrNull(row[targetCol.instance]) } : null;
  };

  const objectives = (value: unknown, instanceId: number): QuestObjective[] =>
    rows(value).flatMap((o) => {
      const kind = targetKind(o[objCol.kind]);
      const found = kind ? target(`${kind}:${Number(o[objCol.id])}`) : null;
      if (!kind || !found) return [];
      return [{ kind, id: Number(o[objCol.id]), name: found.name, count: Number(o[objCol.count]), insideDungeon: found.instance === instanceId }];
    });

  // A reward the names file lacks is dropped, never shown nameless.
  const rewards = (value: unknown): QuestReward[] =>
    rows(value).flatMap(([id, count]) => {
      const item = items.get(Number(id));
      return item ? [{ id: Number(id), name: item.name, count: Number(count) }] : [];
    });

  const givers = (value: unknown, instanceId: number): QuestGiver[] =>
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
      return [{ kind, id: Number(g[giverCol.id]), name: String(g[giverCol.name]), place, insideDungeon: numberOrNull(g[giverCol.instance]) === instanceId }];
    });

  const seen = (id: number): Row | null => files.seenQuests.quests[String(id)] ?? null;

  const chainStep = (id: number): QuestChainStep[] => {
    const row = doc.quests[String(id)];
    if (!row) return [];
    const s = seen(id);
    const [giver] = rows(row[col.givers]);
    return [
      {
        id,
        title: String(s ? s[seenCol.title] : row[col.title]),
        level: Number(s ? s[seenCol.level] : row[col.level]),
        giver: giver ? String(giver[giverCol.name]) : null,
      },
    ];
  };

  const quest = (id: number, instanceId: number): DungeonQuest[] => {
    const row = doc.quests[String(id)];
    if (!row) return [];
    const s = seen(id);
    return [
      {
        id,
        title: String(s ? s[seenCol.title] : row[col.title]),
        level: Number(s ? s[seenCol.level] : row[col.level]),
        minLevel: Number(s ? s[seenCol.minLevel] : row[col.minLevel]),
        side: side(row[col.side]),
        classes: classIds(row[col.classes]),
        givers: givers(row[col.givers], instanceId),
        chain: (Array.isArray(row[col.chain]) ? (row[col.chain] as unknown[]) : []).flatMap((c) => chainStep(Number(c))),
        objectives: objectives(s ? s[seenCol.objectives] : row[col.objectives], instanceId),
        rewards: rewards(s ? s[seenCol.rewards] : row[col.rewards]),
        choices: rewards(s ? s[seenCol.choices] : row[col.choices]),
        enders: (Array.isArray(row[col.enders]) ? (row[col.enders] as unknown[]) : []).flatMap((k) => target(String(k))?.name ?? []),
        seenOn: s ? files.seenQuests.seenOn : null,
      },
    ];
  };

  return (instanceId) => (doc.instances[String(instanceId)] ?? []).flatMap((id) => quest(id, instanceId));
}
