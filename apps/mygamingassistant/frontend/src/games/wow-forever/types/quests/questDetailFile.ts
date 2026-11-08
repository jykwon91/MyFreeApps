/** The raw shape of a classic shard file `data/quests/classic/NNN.json`. */
export interface QuestDetailFile {
  source: Record<string, unknown>;
  questColumns: string[];
  giverColumns: string[];
  objectiveColumns: string[];
  targetColumns: string[];
  quests: Record<string, readonly unknown[]>;
  targets: Record<string, readonly unknown[]>;
}
