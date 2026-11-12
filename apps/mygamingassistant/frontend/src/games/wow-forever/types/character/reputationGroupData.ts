/** A reputation-pane header from `data/character/reputationGroups.json` (`scripts.wow_reputation.build`). */
export interface ReputationGroupData {
  id: number;
  name: string;
  /** "alliance" / "horde", or null for a header both sides share (Steamwheedle Cartel). */
  side: string | null;
  factions: number[];
}
