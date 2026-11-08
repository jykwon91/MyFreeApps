import type { QuestFilter } from "@/games/wow-forever/types/quests/questFilter";

export const DEFAULT_QUEST_FILTER: QuestFilter = {
  q: "",
  zoneId: null,
  side: null,
  minLevel: null,
  maxLevel: null,
  isNew: false,
  seenInGame: false,
};

/** Reads the quest filter from URL search params. */
export function parseQuestFilter(params: URLSearchParams): QuestFilter {
  const q = params.get("q") ?? "";
  const rawZone = params.get("zone");
  const zoneId = rawZone !== null ? (Number.isFinite(Number(rawZone)) ? Number(rawZone) : null) : null;
  const side = params.get("side") ?? null;
  const rawMin = params.get("min");
  const rawMax = params.get("max");
  const minLevel = rawMin !== null && Number.isFinite(Number(rawMin)) ? Number(rawMin) : null;
  const maxLevel = rawMax !== null && Number.isFinite(Number(rawMax)) ? Number(rawMax) : null;
  const isNew = params.get("new") === "1";
  const seenInGame = params.get("seen") === "1";
  return { q, zoneId, side, minLevel, maxLevel, isNew, seenInGame };
}

/** Writes the quest filter to URL search params (omits defaults). */
export function writeQuestFilter(filter: QuestFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.q) p.set("q", filter.q);
  if (filter.zoneId !== null) p.set("zone", String(filter.zoneId));
  if (filter.side !== null) p.set("side", filter.side);
  if (filter.minLevel !== null) p.set("min", String(filter.minLevel));
  if (filter.maxLevel !== null) p.set("max", String(filter.maxLevel));
  if (filter.isNew) p.set("new", "1");
  if (filter.seenInGame) p.set("seen", "1");
  return p;
}
