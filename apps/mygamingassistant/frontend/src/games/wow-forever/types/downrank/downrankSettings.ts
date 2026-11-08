/** What the calculator works out for — all of it lives in the URL. */
export interface DownrankSettings {
  familyId: string;
  /** The character's level. */
  level: number;
  /** +Healing for a heal, +spell damage for a damage spell. */
  bonus: number;
  /** Talents' "% more healing / damage", applied to the whole amount. */
  talentPct: number;
  /** Talents' "% less mana". */
  manaPct: number;
  /** Apply Classic's below-level-20 penalty (Forever's files don't show it). */
  lowLevelPenalty: boolean;
}
