import type { PetAbilityRank } from "@/games/wow-forever/types/hunterPets/petAbilityRank";

/** A pet ability: Bite, Dash, Furious Howl... with every rank and the families that learn it. */
export interface PetAbility {
  slug: string;
  name: string;
  icon: number;
  /** No Classic Era skill line lists any rank. */
  isNew: boolean;
  familyIds: readonly number[];
  ranks: readonly PetAbilityRank[];
}
