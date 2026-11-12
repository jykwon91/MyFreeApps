import type { CharacterTalentGroup } from "@/games/wow-forever/types/character/characterTalentGroup";

/** A character's talents: each saved set, the active one first; no groups = no points spent yet. */
export interface CharacterTalents {
  groups: CharacterTalentGroup[];
}
