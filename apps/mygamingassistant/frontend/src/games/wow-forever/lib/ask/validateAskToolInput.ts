/**
 * Tool inputs Claude sent, checked against the same schema the relay gave it
 * (`chat_tool_schema.py`): known keys only, strings within their lengths, the
 * faction, profession, class, sort and region from their lists, numbers whole and in range. Claude's output is
 * untrusted — a bad input becomes an error result, never a crash.
 */
import { ASK_FACTION_FILTER, ASK_TOOL_INPUT } from "@/games/wow-forever/data/ask/askTools";
import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { PROFESSION_GROUPS, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { WOW_REGIONS } from "@/games/wow-forever/data/wowRegions";
import { FARM_SORT, type FarmSort } from "@/games/wow-forever/gold/goldFarms";
import type { AskFactionFilter } from "@/games/wow-forever/types/ask/askFactionFilter";
import type { AskGoldInput } from "@/games/wow-forever/types/ask/askGoldInput";
import type { AskInputCheck } from "@/games/wow-forever/types/ask/askInputCheck";
import type { AskMacrosInput } from "@/games/wow-forever/types/ask/askMacrosInput";
import type { AskNpcSearchInput } from "@/games/wow-forever/types/ask/askNpcSearchInput";
import type { AskPricesInput } from "@/games/wow-forever/types/ask/askPricesInput";
import type { AskProfessionInput } from "@/games/wow-forever/types/ask/askProfessionInput";
import type { AskQueryInput } from "@/games/wow-forever/types/ask/askQueryInput";
import type { AskRaresInput } from "@/games/wow-forever/types/ask/askRaresInput";
import type { AskRegionInput } from "@/games/wow-forever/types/ask/askRegionInput";
import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

const FACTIONS: readonly AskFactionFilter[] = Object.values(ASK_FACTION_FILTER);
const PROFESSIONS: readonly GuideProfession[] = PROFESSION_GROUPS.flatMap((g) => g.options.map((o) => o.id));
const CLASS_IDS: readonly WowClassId[] = WOW_CLASSES.map((c) => c.id);
const FARM_SORTS: readonly FarmSort[] = Object.values(FARM_SORT);
const REGIONS: readonly WowRegion[] = WOW_REGIONS.map((r) => r.value);

function fail<T>(error: string): AskInputCheck<T> {
  return { ok: false, error };
}

function unknownKey(input: Record<string, unknown>, allowed: readonly string[]): string | undefined {
  return Object.keys(input).find((key) => !allowed.includes(key));
}

function text(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string" || value.length > maxChars) return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 ? trimmed : null;
}

function limit(value: unknown): number | null {
  return value === undefined ? ASK_TOOL_INPUT.defaultLimit : wholeNumber(value, ASK_TOOL_INPUT.limitMax);
}

function queryInput(input: Record<string, unknown>, allowed: readonly string[]): AskInputCheck<AskQueryInput> {
  const extra = unknownKey(input, allowed);
  if (extra !== undefined) return fail(`unknown argument: ${extra}`);
  const query = text(input.query, ASK_TOOL_INPUT.queryMaxChars);
  if (query === null) return fail(`query must be 1-${ASK_TOOL_INPUT.queryMaxChars} characters`);
  const max = limit(input.limit);
  if (max === null) return fail(`limit must be a whole number from 1 to ${ASK_TOOL_INPUT.limitMax}`);
  return { ok: true, value: { query, limit: max } };
}

export function checkNpcSearchInput(input: Record<string, unknown>): AskInputCheck<AskNpcSearchInput> {
  const base = queryInput(input, ["query", "from_zone", "faction", "limit"]);
  if (!base.ok) return base;
  let fromZone: string | null = null;
  if (input.from_zone !== undefined) {
    fromZone = text(input.from_zone, ASK_TOOL_INPUT.zoneMaxChars);
    if (fromZone === null) return fail(`from_zone must be 1-${ASK_TOOL_INPUT.zoneMaxChars} characters`);
  }
  let faction: AskFactionFilter | null = null;
  if (input.faction !== undefined) {
    const found = FACTIONS.find((f) => f === input.faction);
    if (found === undefined) return fail(`faction must be one of ${FACTIONS.join(", ")}`);
    faction = found;
  }
  return { ok: true, value: { ...base.value, fromZone, faction } };
}

/** `find_places` and `dungeon_info` take a query only. */
export function checkQueryOnlyInput(input: Record<string, unknown>): AskInputCheck<AskQueryInput> {
  return queryInput(input, ["query"]);
}

export function checkItemSearchInput(input: Record<string, unknown>): AskInputCheck<AskQueryInput> {
  return queryInput(input, ["query", "limit"]);
}

export function checkNoInput(input: Record<string, unknown>): AskInputCheck<null> {
  const extra = unknownKey(input, []);
  return extra === undefined ? { ok: true, value: null } : fail(`unknown argument: ${extra}`);
}

function wholeNumber(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= max ? value : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return options.find((o) => o === value) ?? null;
}

/**
 * An argument Claude may leave out: `null` when it did, `undefined` when it
 * sent something `read` rejects.
 */
function optional<T>(value: unknown, read: (raw: unknown) => T | null): T | null | undefined {
  if (value === undefined) return null;
  return read(value) ?? undefined;
}

const levelError = `level must be a whole number from 1 to ${ASK_TOOL_INPUT.levelMax}`;

export function checkRaresInput(input: Record<string, unknown>): AskInputCheck<AskRaresInput> {
  const extra = unknownKey(input, ["level", "zone", "limit"]);
  if (extra !== undefined) return fail(`unknown argument: ${extra}`);
  const level = optional(input.level, (v) => wholeNumber(v, ASK_TOOL_INPUT.levelMax));
  if (level === undefined) return fail(levelError);
  const zone = optional(input.zone, (v) => text(v, ASK_TOOL_INPUT.zoneMaxChars));
  if (zone === undefined) return fail(`zone must be 1-${ASK_TOOL_INPUT.zoneMaxChars} characters`);
  const max = limit(input.limit);
  if (max === null) return fail(`limit must be a whole number from 1 to ${ASK_TOOL_INPUT.limitMax}`);
  return { ok: true, value: { level, zone, limit: max } };
}

export function checkProfessionInput(input: Record<string, unknown>): AskInputCheck<AskProfessionInput> {
  const extra = unknownKey(input, ["profession", "skill"]);
  if (extra !== undefined) return fail(`unknown argument: ${extra}`);
  const profession = oneOf(input.profession, PROFESSIONS);
  if (profession === null) return fail(`profession must be one of ${PROFESSIONS.join(", ")}`);
  const skill = optional(input.skill, (v) => wholeNumber(v, ASK_TOOL_INPUT.skillMax));
  if (skill === undefined) return fail(`skill must be a whole number from 1 to ${ASK_TOOL_INPUT.skillMax}`);
  return { ok: true, value: { profession, skill } };
}

export function checkGoldInput(input: Record<string, unknown>): AskInputCheck<AskGoldInput> {
  const extra = unknownKey(input, ["level", "skinning", "sort"]);
  if (extra !== undefined) return fail(`unknown argument: ${extra}`);
  const level = optional(input.level, (v) => wholeNumber(v, ASK_TOOL_INPUT.levelMax));
  if (level === undefined) return fail(levelError);
  const skinning = optional(input.skinning, (v) => (typeof v === "boolean" ? v : null));
  if (skinning === undefined) return fail("skinning must be true or false");
  const sort = optional(input.sort, (v) => oneOf(v, FARM_SORTS));
  if (sort === undefined) return fail(`sort must be one of ${FARM_SORTS.join(", ")}`);
  return { ok: true, value: { level, skinning: skinning ?? false, sort: sort ?? FARM_SORT.gold } };
}

export function checkMacrosInput(input: Record<string, unknown>): AskInputCheck<AskMacrosInput> {
  const extra = unknownKey(input, ["class", "query", "limit"]);
  if (extra !== undefined) return fail(`unknown argument: ${extra}`);
  const classId = optional(input.class, (v) => oneOf(v, CLASS_IDS));
  if (classId === undefined) return fail(`class must be one of ${CLASS_IDS.join(", ")}`);
  const query = optional(input.query, (v) => text(v, ASK_TOOL_INPUT.queryMaxChars));
  if (query === undefined) return fail(`query must be 1-${ASK_TOOL_INPUT.queryMaxChars} characters`);
  const max = limit(input.limit);
  if (max === null) return fail(`limit must be a whole number from 1 to ${ASK_TOOL_INPUT.limitMax}`);
  return { ok: true, value: { classId, query, limit: max } };
}

const regionError = `region must be one of ${REGIONS.join(", ")}`;

export function checkPricesInput(input: Record<string, unknown>): AskInputCheck<AskPricesInput> {
  return queryInput(input, ["query", "limit"]);
}

export function checkServerStatusInput(input: Record<string, unknown>): AskInputCheck<AskRegionInput> {
  const extra = unknownKey(input, ["region"]);
  if (extra !== undefined) return fail(`unknown argument: ${extra}`);
  const region = optional(input.region, (v) => oneOf(v, REGIONS));
  if (region === undefined) return fail(regionError);
  return { ok: true, value: { region } };
}
