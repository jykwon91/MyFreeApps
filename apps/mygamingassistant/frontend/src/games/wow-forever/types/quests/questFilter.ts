/** Active filters on the quest list page (all optional). */
export interface QuestFilter {
  q: string;
  zoneId: number | null;
  /** "A" | "H" | "N" | null — null = show all */
  side: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  isNew: boolean;
  seenInGame: boolean;
}
