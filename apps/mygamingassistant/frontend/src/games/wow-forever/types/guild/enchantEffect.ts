import type { StatValues } from "@/games/wow-forever/data/statKeys";

/** What a permanent enchant adds, read from its tooltip text — only what a stat weight can score. */
export interface EnchantEffect {
  stats: StatValues;
  armor: number;
  /** Flat damage added to every weapon hit. */
  weaponDamage: number;
}
