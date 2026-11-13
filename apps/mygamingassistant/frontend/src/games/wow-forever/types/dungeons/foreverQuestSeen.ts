/** What the operator's own Forever client said about a quest it has seen (`quests/questSeen.json`). */
export interface ForeverQuestSeen {
  level: number;
  minLevel: number;
  /** The day the client wrote its quest cache (YYYY-MM-DD). */
  seenOn: string;
}
