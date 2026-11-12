import type { Talent } from "@/games/wow-forever/types/talents/talent";

/** A talent the character has points in, with the rank they have. */
export interface CharacterTalentLine {
  talent: Talent;
  rank: number;
}
