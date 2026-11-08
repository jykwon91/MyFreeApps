/** A quest you do before the dungeon quest, in order. */
export interface QuestChainStep {
  id: number;
  title: string;
  level: number;
  /** Who gives it (steps of a chain often share a title); null when that isn't in our data. */
  giver: string | null;
}
