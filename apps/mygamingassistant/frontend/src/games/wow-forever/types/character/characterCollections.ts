import type { CharacterCollectible } from "@/games/wow-forever/types/character/characterCollectible";

/** `CharacterResponse.collections`: each list null when Blizzard failed to send it. */
export interface CharacterCollections {
  mounts: CharacterCollectible[] | null;
  pets: CharacterCollectible[] | null;
}
