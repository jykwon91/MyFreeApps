/** A checked `find_rares` input. */
export interface AskRaresInput {
  /** The level the player said; null = their saved level. */
  level: number | null;
  /** A zone or town to look near; null = their saved zone. */
  zone: string | null;
  limit: number;
}
