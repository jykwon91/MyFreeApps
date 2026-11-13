/** Field readers shared by the dungeon-quest and quest-page decoders: both files use the same columns. */
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { QUEST_TARGET_KIND, type QuestTargetKind } from "@/games/wow-forever/types/dungeons/questTargetKind";
import type { QuestDataRow } from "@/games/wow-forever/types/quests/questDataRow";
import { FACTION, type Faction } from "@/games/wow-forever/types/worldMap";

const TARGET_KINDS: readonly string[] = Object.values(QUEST_TARGET_KIND);
const SIDES: readonly string[] = [FACTION.alliance, FACTION.horde, FACTION.neutral];

export function rows(value: unknown): QuestDataRow[] {
  return Array.isArray(value) ? value.filter((r): r is QuestDataRow => Array.isArray(r)) : [];
}

export function targetKind(value: unknown): QuestTargetKind | null {
  return typeof value === "string" && TARGET_KINDS.includes(value) ? (value as QuestTargetKind) : null;
}

export function side(value: unknown): Faction {
  return typeof value === "string" && SIDES.includes(value) ? (value as Faction) : FACTION.neutral;
}

export function classIds(value: unknown): WowClassId[] {
  return String(value ?? "")
    .split(",")
    .flatMap((id) => findClass(id)?.id ?? []);
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function ids(value: unknown): number[] {
  return Array.isArray(value) ? value.map(Number) : [];
}
