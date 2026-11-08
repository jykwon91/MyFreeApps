/** One rank of a pet ability. */
export interface PetAbilityRank {
  spell: number;
  /** 1-based, lowest learn level first. */
  rank: number;
  level: number;
  /** The Forever tooltip text; null when the game files can't fill in all its numbers. */
  text: string | null;
  /** The rank is new in Forever inside an ability Classic has. */
  isNew: boolean;
  /** The families that can learn this rank. */
  familyIds: readonly number[];
}
