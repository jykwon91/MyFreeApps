import type { CharacterStatValue } from "@/games/wow-forever/types/character/characterStatValue";

/** The pane's Defenses tab. Dodge, parry and block are percents. */
export interface CharacterDefenseStats {
  armor: CharacterStatValue;
  defense: CharacterStatValue;
  dodge: number;
  parry: number;
  block: number;
}
