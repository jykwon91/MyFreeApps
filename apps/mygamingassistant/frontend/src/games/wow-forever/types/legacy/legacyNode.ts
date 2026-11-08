/** One Legacy talent: its place on the tree's grid, the points it takes and what it does. */
export interface LegacyNode {
  id: number;
  name: string;
  spell: number;
  /** Icon file data id (0 = none). */
  icon: number;
  maxRanks: number;
  /** Grid column (tiers run left to right) and row, shared by every tree. */
  col: number;
  row: number;
  /** Points to spend in this tree before it opens (0 = open from the start). */
  gate: number;
  /** The game files' tooltip text; null when it couldn't be read. */
  text: string | null;
  /** A placeholder the game files mark "To be added in a future update." — never takes points. */
  comingLater: boolean;
}
