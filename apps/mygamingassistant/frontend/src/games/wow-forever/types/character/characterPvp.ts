/** A character's PvP record (`CharacterResponse.pvp`). */
export interface CharacterPvp {
  /** Blizzard's `pvp_rank`: 0 = no rank yet. */
  rank: number;
  honorable_kills: number;
  /** Null when Blizzard didn't send the statistics pane. */
  deaths_from_players: number | null;
  deaths_from_opposite_faction: number | null;
  /** Where most honorable kills were made; null before the first. */
  top_honor_continent: string | null;
  top_honor_continent_kills: number | null;
}
