import type { CharacterProfession } from "@/games/wow-forever/types/character/characterProfession";

/** The character's main professions and the secondary ones (Cooking, Fishing, First Aid). */
export interface CharacterProfessions {
  primaries: CharacterProfession[];
  secondaries: CharacterProfession[];
}
