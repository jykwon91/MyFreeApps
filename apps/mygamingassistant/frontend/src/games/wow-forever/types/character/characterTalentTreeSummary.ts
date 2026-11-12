import type { CharacterTalentLine } from "@/games/wow-forever/types/character/characterTalentLine";

/** One of the class's trees on the character page: its points and the talents taken, in tier then column order. */
export interface CharacterTalentTreeSummary {
  name: string;
  points: number;
  lines: CharacterTalentLine[];
}
