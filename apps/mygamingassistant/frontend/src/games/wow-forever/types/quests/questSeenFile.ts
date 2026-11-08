/** The raw shape of `data/quests/questSeen.json`. */
export interface QuestSeenFile {
  source: string;
  clientBuild: number;
  seenOn: string;
  attribution: string;
  columns: string[];
  quests: Record<string, readonly unknown[]>;
}
