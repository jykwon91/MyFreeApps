import type { Talent } from "@/games/wow-forever/types/talents/talent";

/** The talent opened on the character page and the character's rank in it. */
export interface CharacterTalentPicked {
  talent: Talent;
  rank: number;
}
