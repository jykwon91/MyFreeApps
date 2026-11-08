/** The raw shape of `data/quests/questIndex.json` (before decoding). */
export interface QuestIndexFile {
  source: Record<string, unknown>;
  clientBuild: string;
  columns: string[];
  zones: [number, string][];
  counts: {
    total: number;
    named: number;
    withClassic: number;
    seenInGame: number;
    unnamed: number;
  };
  quests: readonly (number | string | boolean | null)[][];
}
