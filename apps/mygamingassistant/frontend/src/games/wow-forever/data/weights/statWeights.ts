import type { StatKey } from "@/games/wow-forever/data/statKeys";

/**
 * One stat-weight scale: score = sum(stat * weight) + weapon DPS * DPS weight
 * + armor * armor weight. Stats with no entry here are shown as "not scored".
 */
export interface StatWeights {
  stats: Partial<Record<StatKey, number>>;
  /** Per point of melee weapon DPS (one-hand, two-hand, main/off hand). */
  meleeWeaponDps: number;
  /** Per point of ranged weapon DPS (bow, gun, crossbow, thrown, wand). */
  rangedWeaponDps: number;
  /** Per point of armor. */
  armor: number;
}

export type WeightBracket = "leveling" | "level60";

export const WEIGHT_BRACKETS: readonly { id: WeightBracket; label: string }[] = [
  { id: "leveling", label: "Leveling" },
  { id: "level60", label: "Level 60" },
];
