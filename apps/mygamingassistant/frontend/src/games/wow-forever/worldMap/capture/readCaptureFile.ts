/**
 * Turn the MGA Companion addon's SavedVariables (`MGACompanion.lua`) into
 * World Map captures ready to import. Record shapes are written by
 * `apps/mygamingassistant/addons/MGACompanion/Capture.lua`.
 */
import {
  FACTION,
  INSTANCE_KIND,
  POI_KIND,
  QUEST_GIVER_KIND,
  type Faction,
  type InstanceKind,
  type QuestGiverKind,
} from "@/games/wow-forever/types/worldMap";
import type { CapturedQuest, MapCapture } from "@/games/wow-forever/types/mapCapture";
import {
  classifyCapturedNpc,
  NPC_OFFER,
  type NpcOffer,
} from "@/games/wow-forever/worldMap/capture/classifyCapturedNpc";
import { LuaParseError, parseSavedVariables, type LuaObject, type LuaValue } from "@/games/wow-forever/worldMap/capture/luaTable";

export const DB_VARIABLE = "MGACompanionDB";
const SUPPORTED_VERSION = 1;
const MAX_NAME = 120;
const MAX_QUEST_TITLE = 200;
const MAX_QUESTS = 50;
const MAX_LEVEL = 100;

/** Why a record wasn't imported — counted and shown to the operator. */
export const SKIP_REASON = {
  notAService: "not a trainer or other service the map shows",
  unknownZone: "on a map the site doesn't know",
  incomplete: "missing its name or position",
} as const;
export type SkipReason = (typeof SKIP_REASON)[keyof typeof SKIP_REASON];

export interface CaptureFileResult {
  captures: MapCapture[];
  skipped: Partial<Record<SkipReason, number>>;
}

export class CaptureFileError extends Error {}

function asObject(value: LuaValue | undefined): LuaObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function text(value: LuaValue | undefined, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function whole(value: LuaValue | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function level(value: LuaValue | undefined): number | null {
  const n = whole(value);
  return n === null ? null : Math.min(n, MAX_LEVEL);
}

function coord(value: LuaValue | undefined): number | null {
  return typeof value === "number" && value > 0 && value < 100 ? Math.round(value * 10) / 10 : null;
}

function faction(value: LuaValue | undefined): Faction | null {
  return Object.values(FACTION).find((f) => f === value) ?? null;
}

function offersOf(value: LuaValue | undefined): Set<NpcOffer> {
  const offers = asObject(value) ?? {};
  return new Set(Object.values(NPC_OFFER).filter((o) => offers[o] === true));
}

function questsOf(value: LuaValue | undefined, playerLevel: number): CapturedQuest[] {
  const quests = Array.isArray(value) ? value : [];
  return quests.flatMap((raw) => {
    const q = asObject(raw);
    const title = text(q?.title, MAX_QUEST_TITLE);
    if (!q || !title) return [];
    const questLevel = level(q.level) ?? playerLevel;
    return [{ id: whole(q.id), title, level: questLevel, min_level: Math.min(questLevel, playerLevel) }];
  }).slice(0, MAX_QUESTS);
}

type Where = Pick<MapCapture, "zone_id" | "subzone" | "x" | "y" | "faction" | "captured_at">;

type Converted = MapCapture | SkipReason;

function convertNpc(key: string, r: LuaObject, where: Where, name: string): Converted {
  const title = text(r.title, MAX_NAME);
  const service = classifyCapturedNpc(title, offersOf(r.offers));
  if (!service) return SKIP_REASON.notAService;
  return { capture_key: `${key}:service`, kind: POI_KIND.service, ...service, npc_id: whole(r.id), name, title, ...where };
}

function convertQuestGiver(key: string, r: LuaObject, where: Where, name: string): Converted {
  const subkind: QuestGiverKind | undefined = Object.values(QUEST_GIVER_KIND).find((k) => k === r.type);
  if (!subkind) return SKIP_REASON.incomplete;
  return {
    capture_key: key,
    kind: POI_KIND.questGiver,
    subkind,
    tag: "",
    npc_id: whole(r.id),
    name,
    title: "",
    ...where,
    quests: questsOf(r.quests, level(r.playerLevel) ?? 1),
  };
}

function convertInstance(key: string, r: LuaObject, where: Where, name: string): Converted {
  const subkind: InstanceKind | undefined = Object.values(INSTANCE_KIND).find((k) => k === r.type);
  if (!subkind) return SKIP_REASON.incomplete;
  const instanceId = whole(r.id);
  return {
    capture_key: key,
    kind: POI_KIND.instance,
    subkind,
    // The instance's map id, like the Classic rows' tag.
    tag: instanceId === null ? "" : String(instanceId),
    name,
    title: "",
    ...where,
    faction: FACTION.neutral,
  };
}

const CONVERTERS: Readonly<Record<string, (key: string, r: LuaObject, where: Where, name: string) => Converted>> = {
  npc: convertNpc,
  quest: convertQuestGiver,
  instance: convertInstance,
};

function convert(key: string, record: LuaObject, knownZone: (id: number) => boolean): Converted {
  const name = text(record.name, MAX_NAME);
  const zone = whole(record.map);
  const x = coord(record.x);
  const y = coord(record.y);
  const who = faction(record.faction);
  const at = typeof record.at === "number" ? record.at : null;
  const converter = typeof record.kind === "string" ? CONVERTERS[record.kind] : undefined;
  if (!converter || !name || zone === null || x === null || y === null || !who || at === null) return SKIP_REASON.incomplete;
  if (!knownZone(zone)) return SKIP_REASON.unknownZone;
  const where: Where = {
    zone_id: zone,
    subzone: text(record.subzone, MAX_NAME),
    x,
    y,
    faction: who,
    captured_at: new Date(at * 1000).toISOString(),
  };
  return converter(key, record, where, name);
}

/**
 * Read an uploaded / pasted `MGACompanion.lua`.
 * `knownZone` says whether the site has a map for a uiMapID.
 */
export function readCaptureFile(fileText: string, knownZone: (id: number) => boolean): CaptureFileResult {
  let variables: LuaObject;
  try {
    variables = parseSavedVariables(fileText);
  } catch (error) {
    if (error instanceof LuaParseError) throw new CaptureFileError(`That doesn't look like addon data: ${error.message}`);
    throw error;
  }
  const db = asObject(variables[DB_VARIABLE]);
  if (!db) throw new CaptureFileError("No MGA Companion data in that file — pick MGACompanion.lua from SavedVariables.");
  if (db.version !== SUPPORTED_VERSION) throw new CaptureFileError("That file is from a different version of the MGA Companion addon.");
  const records = asObject(db.captures) ?? {};
  const result: CaptureFileResult = { captures: [], skipped: {} };
  for (const [key, raw] of Object.entries(records)) {
    const record = asObject(raw);
    const converted = record ? convert(key, record, knownZone) : SKIP_REASON.incomplete;
    if (typeof converted === "string") result.skipped[converted] = (result.skipped[converted] ?? 0) + 1;
    else result.captures.push(converted);
  }
  return result;
}
