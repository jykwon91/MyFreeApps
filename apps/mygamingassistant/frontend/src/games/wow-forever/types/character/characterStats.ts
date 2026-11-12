import type { CharacterDefenseStats } from "@/games/wow-forever/types/character/characterDefenseStats";
import type { CharacterMeleeStats } from "@/games/wow-forever/types/character/characterMeleeStats";
import type { CharacterRangedStats } from "@/games/wow-forever/types/character/characterRangedStats";
import type { CharacterResistances } from "@/games/wow-forever/types/character/characterResistances";
import type { CharacterSpellStats } from "@/games/wow-forever/types/character/characterSpellStats";
import type { CharacterStatValue } from "@/games/wow-forever/types/character/characterStatValue";

/** The character pane's numbers, Blizzard's own totals at the last log out. */
export interface CharacterStats {
  health: number;
  power: number;
  /** "Mana", "Rage", "Energy". */
  power_type: string;
  strength: CharacterStatValue;
  agility: CharacterStatValue;
  stamina: CharacterStatValue;
  intellect: CharacterStatValue;
  spirit: CharacterStatValue;
  melee: CharacterMeleeStats;
  ranged: CharacterRangedStats;
  spell: CharacterSpellStats;
  defenses: CharacterDefenseStats;
  resistances: CharacterResistances;
  /** Percent of normal run speed. */
  movement_speed: number;
}
