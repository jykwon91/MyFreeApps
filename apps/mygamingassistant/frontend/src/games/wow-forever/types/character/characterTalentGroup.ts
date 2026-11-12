import type { CharacterTalentPick } from "@/games/wow-forever/types/character/characterTalentPick";

/** One saved set of talents; `active` is the set the character had on at their last log out. */
export interface CharacterTalentGroup {
  active: boolean;
  picks: CharacterTalentPick[];
}
