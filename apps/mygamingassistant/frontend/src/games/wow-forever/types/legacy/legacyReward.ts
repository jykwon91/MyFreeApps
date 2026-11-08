/** A reward the account's Legacy rank unlocks. */
export interface LegacyReward {
  rank: number;
  name: string;
  /** The reward's description, one paragraph per line. */
  lines: readonly string[];
  itemId: number;
  icon: number;
}
