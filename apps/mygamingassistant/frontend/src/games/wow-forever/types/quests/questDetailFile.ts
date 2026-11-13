/** The raw shape of a classic shard file `data/quests/classic/NNN.json`. */
export interface QuestDetailFile {
  source: Record<string, unknown>;
  questColumns: string[];
  giverColumns: string[];
  objectiveColumns: string[];
  targetColumns: string[];
  /** Columns of `steps`: title, level, first giver's name. */
  stepColumns: string[];
  quests: Record<string, readonly unknown[]>;
  targets: Record<string, readonly unknown[]>;
  /** Every quest in these quests' lines (before or after), wherever its own shard is. */
  steps: Record<string, readonly unknown[]>;
}
