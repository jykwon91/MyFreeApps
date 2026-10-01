import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { MAX_CRAFT_SKILL, parseSkill } from "@/games/wow-forever/crafting/craftRoute";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

export const CRAFT_SKILL_STORAGE_KEY = "mga.wowForever.professions.skill.v1";
export const SKILL_PARAM = "skill";

type StoredSkills = Partial<Record<CraftingProfession, number>>;

function parseStored(raw: unknown): StoredSkills | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out: StoredSkills = {};
  for (const [key, value] of Object.entries(raw)) {
    const skill = parseSkill(value);
    if (skill !== null && (key === "tailoring" || key === "enchanting")) out[key] = skill;
  }
  return out;
}

/** A typed skill above the cap means "maxed"; below 1 or not a whole number means none. */
export function clampSkill(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return parseSkill(Math.min(Math.round(value), MAX_CRAFT_SKILL));
}

/**
 * Your skill in a crafting profession. A `?skill=` link wins for that visit
 * without overwriting what you saved; typing a skill saves it per profession.
 */
export function useCraftingSkill(profession: CraftingProfession): [number | null, (skill: number | null) => void] {
  const [params, setParams] = useSearchParams();
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
