/** One dungeon (or wing) and how many times the character has killed its final boss. */
export interface CharacterDungeon {
  name: string;
  /** "Cathedral", "Lower"…; null for a dungeon with one way through. */
  wing: string | null;
  /** A Classic dungeon, with a guide page; false for Forever's own. */
  classic: boolean;
  /** The final boss; null when it isn't known. */
  boss: string | null;
  /** Final-boss kills; null when Blizzard doesn't track this dungeon. */
  kills: number | null;
  /** Forever's level range; the same number twice for a Classic dungeon's one level. */
  level_min: number;
  level_max: number;
  /** The level to enter; null for Forever's own dungeons. */
  required_level: number | null;
}
