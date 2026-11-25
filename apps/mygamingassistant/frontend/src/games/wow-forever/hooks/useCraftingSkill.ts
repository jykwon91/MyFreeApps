import { useCallback, useMemo } from "react";
import { MAX_CRAFT_SKILL, parseSkill } from "@/games/wow-forever/crafting/craftRoute";
import { isCraftingProfession, isGatheringProfession } from "@/games/wow-forever/lib/guideProfession";
import { useSelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import { characterSkillIn } from "@/games/wow-forever/lib/character/characterSkill";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CharacterDefaultState } from "@/games/wow-forever/types/character/characterDefaultState";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import { useLiveSearchParams } from "@platform/ui";

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

/** The skill you saved on a profession's guide; null when you haven't typed one. */
export function readSavedSkill(profession: SkilledProfession): number | null {
  return readStored(CRAFT_SKILL_STORAGE_KEY, parseStored, {})[profession] ?? null;
}

/**
 * Your skill in a crafting or gathering profession. A `?skill=` link wins for
 * that visit without overwriting what you saved; typing a skill saves it per profession and wins
 * over the selected character's own skill until another character is picked or it is reset (clearing the box).
 * The third value is the reset, null with no character (or one that hasn't learned the profession).
 */
export function useCraftingSkill(
  profession: SkilledProfession,
): [number | null, (skill: number | null) => void, CharacterDefaultState | null] {
  const [params, setParams] = useLiveSearchParams();
  const { name, character } = useSelectedCharacter();
  const fromUrl = parseSkill(params.get(SKILL_PARAM));
  const saved = readSavedSkill(profession);
  const fromCharacter = character ? characterSkillIn(character, profession) : null;
  const skill = fromUrl ?? saved ?? fromCharacter;

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

  const reset = useMemo((): CharacterDefaultState | null => {
    if (!name || fromCharacter === null) return null;
    const typed = fromUrl ?? saved;
    return { characterName: name, overridden: typed !== null && typed !== fromCharacter, reset: () => update(null) };
  }, [name, fromCharacter, fromUrl, saved, update]);

  return [skill, update, reset];
}
