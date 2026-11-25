import { guideProfession } from "@/games/wow-forever/lib/character/characterProfessions";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";

/** The guides for the professions the character has learned, main ones first (those Blizzard sent and we have a guide for). */
export function characterGuideProfessions(character: CharacterResponse): GuideProfession[] {
  const professions = character.professions;
  const learned = [...(professions?.primaries ?? []), ...(professions?.secondaries ?? [])];
  return learned.flatMap((p) => guideProfession(p.id) ?? []);
}
