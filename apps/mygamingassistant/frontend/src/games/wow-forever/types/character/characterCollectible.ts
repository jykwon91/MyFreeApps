/** One mount or pet a character has collected. */
export interface CharacterCollectible {
  /** Blizzard's mount id or pet species id. */
  id: number;
  name: string;
  /** How many are owned (pets can be learned twice); mounts are always 1. */
  count: number;
}
