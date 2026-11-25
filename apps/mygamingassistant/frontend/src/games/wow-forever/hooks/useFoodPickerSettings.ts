import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { findClass, findSpec, LEVELING_SPEC_ID, type WowClassId } from "@/games/wow-forever/data/classes";
import { findActivity, type FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { MAX_LEVEL, playerLevel } from "@/games/wow-forever/data/levelCap";
import {
  PLAYER_SETTINGS_STORAGE_KEY,
  parsePlayerSettings,
  usePlayerSettings,
  type PlayerSettings,
} from "@/games/wow-forever/hooks/usePlayerSettings";
import { useSelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import { characterSkillIn } from "@/games/wow-forever/lib/character/characterSkill";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CharacterDefaultState } from "@/games/wow-forever/types/character/characterDefaultState";
import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";

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

/** With a character selected, its level, class and Cooking skill replace the remembered ones. */
function followingCharacter(settings: FoodPickerSettings, player: PlayerSettings, cooking: number | null): FoodPickerSettings {
  if (player.characterSlug === null) return settings;
  return {
    ...settings,
    level: player.level,
    classId: player.classId,
    specId: settings.classId === player.classId ? settings.specId : LEVELING_SPEC_ID,
    cookingSkill: cooking,
  };
}

/** Last settings used here; else level + class from the World Map "You" section. The selected character wins for those and Cooking. */
function storedSettings(player: PlayerSettings, cooking: number | null): FoodPickerSettings {
  const stored = readStored<FoodPickerSettings | null>(
    FOOD_SETTINGS_STORAGE_KEY,
    (raw) => (typeof raw === "object" && raw !== null ? parseFoodSettings(raw as Record<string, unknown>, DEFAULT_FOOD_SETTINGS) : null),
    null,
  );
  if (stored) return followingCharacter(stored, player, cooking);
  const saved = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  if (!saved) return DEFAULT_FOOD_SETTINGS;
  return followingCharacter({ ...DEFAULT_FOOD_SETTINGS, level: saved.level, classId: saved.classId }, player, cooking);
}

function fromParams(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(PARAM)) {
    const value = params.get(key);
    if (value !== null) raw[field] = value;
  }
  return raw;
}

/** The URL carries the activity, and level / class / Cooking only where they differ from `base` (the character's own). */
function toParams(s: FoodPickerSettings, base: FoodPickerSettings | null): Record<string, string> {
  const differs = (field: keyof FoodPickerSettings) => base === null || s[field] !== base[field];
  const out: Record<string, string> = { [PARAM.activity]: s.activity };
  if (differs("classId")) out[PARAM.classId] = s.classId;
  // A value cleared over the character's own is sent empty: "none", not "the character's".
  if (differs("level") && (s.level !== null || base !== null)) out[PARAM.level] = s.level === null ? "" : String(s.level);
  if (s.specId !== LEVELING_SPEC_ID) out[PARAM.specId] = s.specId;
  if (differs("cookingSkill") && (s.cookingSkill !== null || base !== null)) {
    out[PARAM.cookingSkill] = s.cookingSkill === null ? "" : String(s.cookingSkill);
  }
  return out;
}

/**
 * Food picker settings. The URL holds them (so a link shares the exact
 * question); they're also remembered for the next visit.
 */
export function useFoodPickerSettings(): [FoodPickerSettings, (patch: Partial<FoodPickerSettings>) => void, CharacterDefaultState | null] {
  const [params, setParams] = useSearchParams();
  const [player] = usePlayerSettings();
  const { name, character } = useSelectedCharacter();
  const following = player.characterSlug !== null;
  const cooking = character ? characterSkillIn(character, PROFESSION.cooking) : null;
  const base = useMemo(() => storedSettings(player, cooking), [player, cooking]);
  const settings = useMemo(() => parseFoodSettings(fromParams(params), base), [params, base]);
  const overridden =
    following && (settings.level !== base.level || settings.classId !== base.classId || settings.cookingSkill !== base.cookingSkill);
  // The router applies a URL change in a transition. A second change made before
  // it lands (type a level, then pick a class) must build on the first, not on
  // the settings this render still shows, or the level is lost.
  const pending = useRef<FoodPickerSettings | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [params]);

  const go = useCallback(
    (next: FoodPickerSettings) => {
      pending.current = next;
      writeStored(FOOD_SETTINGS_STORAGE_KEY, next);
      setParams(toParams(next, following ? base : null), { replace: true });
    },
    [base, following, setParams],
  );

  const update = useCallback(
    (patch: Partial<FoodPickerSettings>) => {
      const prev = pending.current ?? settings;
      const next = { ...prev, ...patch };
      // Spec ids are only unique within a class.
      if (patch.classId && patch.classId !== prev.classId && patch.specId === undefined) next.specId = LEVELING_SPEC_ID;
      go(next);
    },
    [settings, go],
  );

  const reset = useCallback(
    () => go({ ...settings, level: base.level, classId: base.classId, specId: base.specId, cookingSkill: base.cookingSkill }),
    [settings, base, go],
  );

  return [settings, update, name ? { characterName: name, overridden, reset } : null];
}
