import { useCallback } from "react";
import { useLiveSearchParams } from "@/games/wow-forever/hooks/useLiveSearchParams";
import { MAX_CRAFT_SKILL, parseSkill } from "@/games/wow-forever/crafting/craftRoute";
import { isCraftingProfession, isGatheringProfession } from "@/games/wow-forever/lib/guideProfession";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";

export const CRAFT_SKILL_STORAGE_KEY = "mga.wowForever.professions.skill.v1";
export const SKILL_PARAM = "skill";

/** A profession whose guide has a "Your skill" box. */
export type SkilledProfession = CraftingProfession | GatheringProfession;

type StoredSkills = Partial<Record<SkilledProfession, number>>;

function isSkilledProfession(key: string): key is SkilledProfession {
  return isCraftingProfession(key) || isGatheringProfession(key);
}

/** The saved object is one skill per profession; keys that aren't a skilled profession are dropped. */
function parseStored(raw: unknown): StoredSkills | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out: StoredSkills = {};
  for (const [key, value] of Object.entries(raw)) {
    const skill = parseSkill(value);
    if (skill !== null && isSkilledProfession(key)) out[key] = skill;
  }
  return out;
}

/** A typed skill above the cap means "maxed"; below 1 or not a whole number means none. */
export function clampSkill(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return parseSkill(Math.min(Math.round(value), MAX_CRAFT_SKILL));
}

/**
 * Your skill in a crafting or gathering profession. A `?skill=` link wins for
 * that visit without overwriting what you saved; typing a skill saves it per profession.
 */
export function useCraftingSkill(profession: SkilledProfession):[number | null, (skill: number | null) => void] {
  const [params, setParams] = useLiveSearchParams();
  const fromUrl = parseSkill(params.get(SKILL_PARAM));
  const skill = fromUrl ?? readStored(CRAFT_SKILL_STORAGE_KEY, parseStored, {})[profession] ?? null;

  const update = useCallback(
    (next: number | null) => {
      const value = clampSkill(next);
      const stored = { ...readStored(CRAFT_SKILL_STORAGE_KEY, parseStored, {}) };
      if (value === null) delete stored[profession];
      else stored[profession] = value;
      writeStored(CRAFT_SKILL_STORAGE_KEY, stored);
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (value === null) out.delete(SKILL_PARAM);
          else out.set(SKILL_PARAM, String(value));
          return out;
        },
        { replace: true },
      );
    },
    [profession, setParams],
  );

  return [skill, update];
}
