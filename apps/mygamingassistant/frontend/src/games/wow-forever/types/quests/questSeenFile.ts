/** The raw shape of `data/quests/questSeen.json`. */
export interface QuestSeenFile {
  source: string;
  clientBuild: number;
  /** The day of the newest cache read; each row has its own. */
  seenOn: string;
  attribution: string;
  columns: string[];
  quests: Record<string, readonly unknown[]>;
}
