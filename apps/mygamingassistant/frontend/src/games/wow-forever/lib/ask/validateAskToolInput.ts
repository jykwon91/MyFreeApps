/**
 * Tool inputs Claude sent, checked against the same schema the relay gave it
 * (`chat_tool_schema.py`): known keys only, strings within their lengths, the
 * faction from its list, the limit a whole number in range. Claude's output is
 * untrusted — a bad input becomes an error result, never a crash.
 */
import { ASK_FACTION_FILTER, ASK_TOOL_INPUT } from "@/games/wow-forever/data/ask/askTools";
import type { AskFactionFilter } from "@/games/wow-forever/types/ask/askFactionFilter";
import type { AskInputCheck } from "@/games/wow-forever/types/ask/askInputCheck";
import type { AskNpcSearchInput } from "@/games/wow-forever/types/ask/askNpcSearchInput";
import type { AskQueryInput } from "@/games/wow-forever/types/ask/askQueryInput";

const FACTIONS: readonly AskFactionFilter[] = Object.values(ASK_FACTION_FILTER);

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
  if (value === undefined) return ASK_TOOL_INPUT.defaultLimit;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= ASK_TOOL_INPUT.limitMax ? value : null;
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
