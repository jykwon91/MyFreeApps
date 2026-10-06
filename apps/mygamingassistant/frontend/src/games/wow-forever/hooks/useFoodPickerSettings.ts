import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { findClass, findSpec, LEVELING_SPEC_ID, type WowClassId } from "@/games/wow-forever/data/classes";
import { findActivity, type FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { MAX_LEVEL, playerLevel } from "@/games/wow-forever/data/levelCap";
import { PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";

export const FOOD_SETTINGS_STORAGE_KEY = "mga.wowForever.food.settings.v1";

export const MAX_COOKING_SKILL = 375;

export interface FoodPickerSettings {
  level: number | null;
  classId: WowClassId;
  specId: string;
  activity: FoodActivity;
  cookingSkill: number | null;
}

export const DEFAULT_FOOD_SETTINGS: FoodPickerSettings = {
  level: null,
  classId: "warrior",
  specId: LEVELING_SPEC_ID,
  activity: "leveling",
  cookingSkill: null,
};

const PARAM = { level: "lvl", classId: "class", specId: "spec", activity: "act", cookingSkill: "skill" } as const;

function intIn(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** A level to look food up for; above the cap reads as the cap (nobody can be higher yet). */
function levelFrom(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_LEVEL) return null;
  return playerLevel(n);
}

function validSpec(classId: WowClassId, specId: unknown): string {
  if (typeof specId === "string" && findSpec(classId, specId)) return specId;
  return LEVELING_SPEC_ID;
}

/** Accept a stored or URL value field by field, falling back per field. */
export function parseFoodSettings(raw: Record<string, unknown>, fallback: FoodPickerSettings): FoodPickerSettings {
  const cls = typeof raw.classId === "string" ? findClass(raw.classId) : undefined;
  const classId = cls?.id ?? fallback.classId;
  const specSource = cls ? raw.specId : (raw.specId ?? fallback.specId);
  return {
    level: raw.level === undefined ? fallback.level : levelFrom(raw.level),
    classId,
    specId: validSpec(classId, specSource),
    activity: findActivity(typeof raw.activity === "string" ? raw.activity : null) ?? fallback.activity,
    cookingSkill: raw.cookingSkill === undefined ? fallback.cookingSkill : intIn(raw.cookingSkill, 1, MAX_COOKING_SKILL),
  };
}

/** Last settings used here; else level + class from the World Map "You" section. */
function storedSettings(): FoodPickerSettings {
  const stored = readStored<FoodPickerSettings | null>(
    FOOD_SETTINGS_STORAGE_KEY,
    (raw) => (typeof raw === "object" && raw !== null ? parseFoodSettings(raw as Record<string, unknown>, DEFAULT_FOOD_SETTINGS) : null),
    null,
  );
  if (stored) return stored;
  const player = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  if (!player) return DEFAULT_FOOD_SETTINGS;
  return { ...DEFAULT_FOOD_SETTINGS, level: player.level, classId: player.classId };
}

function fromParams(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(PARAM)) {
    const value = params.get(key);
    if (value !== null) raw[field] = value;
  }
  return raw;
}

function toParams(s: FoodPickerSettings): Record<string, string> {
  const out: Record<string, string> = { [PARAM.classId]: s.classId, [PARAM.activity]: s.activity };
  if (s.level !== null) out[PARAM.level] = String(s.level);
  if (s.specId !== LEVELING_SPEC_ID) out[PARAM.specId] = s.specId;
  if (s.cookingSkill !== null) out[PARAM.cookingSkill] = String(s.cookingSkill);
  return out;
}

/**
 * Food picker settings. The URL holds them (so a link shares the exact
 * question); they're also remembered for the next visit.
 */
export function useFoodPickerSettings(): [FoodPickerSettings, (patch: Partial<FoodPickerSettings>) => void] {
  const [params, setParams] = useSearchParams();
  const settings = useMemo(() => parseFoodSettings(fromParams(params), storedSettings()), [params]);

  const update = useCallback(
    (patch: Partial<FoodPickerSettings>) => {
      const next = { ...settings, ...patch };
      // Spec ids are only unique within a class.
      if (patch.classId && patch.classId !== settings.classId && patch.specId === undefined) next.specId = LEVELING_SPEC_ID;
      writeStored(FOOD_SETTINGS_STORAGE_KEY, next);
      setParams(toParams(next), { replace: true });
    },
    [settings, setParams],
  );

  return [settings, update];
}
