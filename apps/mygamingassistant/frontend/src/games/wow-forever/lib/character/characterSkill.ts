import { guideProfession } from "@/games/wow-forever/lib/character/characterProfessions";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** The character's skill in a guide profession (main or secondary), or null when they haven't learned it or Blizzard sent none. */
export function characterSkillIn(character: CharacterResponse, profession: string): number | null {
  const professions = character.professions;
  const learned = [...(professions?.primaries ?? []), ...(professions?.secondaries ?? [])].find(
    (p) => guideProfession(p.id) === profession,
  );
  return learned?.skill ?? null;
}
