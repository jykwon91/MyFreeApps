/** What a class can learn to equip (Classic), by item type name as the game files spell it. */
export interface ClassProficiency {
  armor: readonly string[];
  /** Level the class trains its heaviest armor (Mail / Plate at 40); null = none. */
  heavyArmor: { type: string; level: number } | null;
  oneHand: readonly string[];
  twoHand: readonly string[];
  ranged: readonly string[];
  shield: boolean;
  /** Level dual wield is trained; null = never. */
  dualWieldLevel: number | null;
}
