import type { WowClassId } from "@/games/wow-forever/data/classes";
import {
  DEFAULT_DOWNRANK_CLASS,
  DOWNRANK_BONUS_PARAM,
  DOWNRANK_LEVEL_PARAM,
  DOWNRANK_LOW_LEVEL_OFF,
  DOWNRANK_LOW_LEVEL_PARAM,
  DOWNRANK_MANA_PARAM,
  DOWNRANK_SPELL_PARAM,
  DOWNRANK_TALENT_PARAM,
  MAX_DOWNRANK_BONUS,
  MAX_TALENT_PCT,
} from "@/games/wow-forever/data/downrank/downrankConfig";
import { levelCap, playerLevel } from "@/games/wow-forever/data/levelCap";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankSettings } from "@/games/wow-forever/types/downrank/downrankSettings";

/** What the page falls back to with nothing in the URL: the World Map's saved class and level. */
export interface DownrankFallback {
  classId: WowClassId | null;
  level: number | null;
}

/** A whole number from `min` to `max`; anything else is null. */
function wholeNumber(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** The first family of the class, else of the default class. */
export function defaultFamilyId(families: readonly DownrankFamily[], classId: WowClassId | null): string {
  const own = families.find((f) => f.classId === classId);
  return (own ?? families.find((f) => f.classId === DEFAULT_DOWNRANK_CLASS) ?? families[0]).id;
}

/** The settings a URL asks for; anything missing or unreadable falls back. */
export function parseDownrankSettings(
  params: URLSearchParams,
  families: readonly DownrankFamily[],
  fallback: DownrankFallback,
): DownrankSettings {
  const spell = params.get(DOWNRANK_SPELL_PARAM);
  const level = playerLevel(wholeNumber(params.get(DOWNRANK_LEVEL_PARAM), 1, levelCap()));
  return {
    familyId: families.find((f) => f.id === spell)?.id ?? defaultFamilyId(families, fallback.classId),
    level: level ?? fallback.level ?? levelCap(),
    bonus: wholeNumber(params.get(DOWNRANK_BONUS_PARAM), 0, MAX_DOWNRANK_BONUS) ?? 0,
    talentPct: wholeNumber(params.get(DOWNRANK_TALENT_PARAM), 0, MAX_TALENT_PCT) ?? 0,
    manaPct: wholeNumber(params.get(DOWNRANK_MANA_PARAM), 0, MAX_TALENT_PCT) ?? 0,
    lowLevelPenalty: params.get(DOWNRANK_LOW_LEVEL_PARAM) !== DOWNRANK_LOW_LEVEL_OFF,
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/**
 * `params` with the settings written in. Spell and level are always written, so a shared link shows the
 * same answer to someone with another saved class or level; zeros and the default penalty are left out.
 */
export function writeDownrankSettings(params: URLSearchParams, settings: DownrankSettings): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(DOWNRANK_SPELL_PARAM, settings.familyId);
  next.set(DOWNRANK_LEVEL_PARAM, String(settings.level));
  setOrDelete(next, DOWNRANK_BONUS_PARAM, settings.bonus ? String(settings.bonus) : null);
  setOrDelete(next, DOWNRANK_TALENT_PARAM, settings.talentPct ? String(settings.talentPct) : null);
  setOrDelete(next, DOWNRANK_MANA_PARAM, settings.manaPct ? String(settings.manaPct) : null);
  setOrDelete(next, DOWNRANK_LOW_LEVEL_PARAM, settings.lowLevelPenalty ? null : DOWNRANK_LOW_LEVEL_OFF);
  return next;
}
