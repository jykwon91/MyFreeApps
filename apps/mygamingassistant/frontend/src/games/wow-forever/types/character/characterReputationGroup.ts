import type { CharacterReputation } from "@/games/wow-forever/types/character/characterReputation";

/** One header of the character's reputation pane and the factions under it, alphabetical. */
export interface CharacterReputationGroup {
  /** The header's faction id, or 0 for the factions under no header ("Other"). */
  id: number;
  name: string;
  reputations: CharacterReputation[];
}
