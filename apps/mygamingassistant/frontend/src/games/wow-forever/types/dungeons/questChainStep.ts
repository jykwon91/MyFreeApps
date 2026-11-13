/** A quest in the dungeon quest's line, before or after it, in order. */
export interface QuestChainStep {
  id: number;
  title: string;
  level: number;
  /** Who gives it (steps of a chain often share a title); null when that isn't in our data. */
  giver: string | null;
}
