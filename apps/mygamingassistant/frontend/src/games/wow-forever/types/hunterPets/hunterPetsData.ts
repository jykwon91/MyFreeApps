import type { HunterFamily } from "@/games/wow-forever/types/hunterPets/hunterFamily";
import type { PetAbility } from "@/games/wow-forever/types/hunterPets/petAbility";
import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

/** The Hunter pets guide's decoded data. */
export interface HunterPetsData {
  families: readonly HunterFamily[];
  abilities: readonly PetAbility[];
  beasts: readonly TamableBeast[];
}
