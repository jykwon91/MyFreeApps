import type { HUNTER_PETS_STATUS } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";

/** The Hunter pets data's load state (its own lazy chunks). */
export type HunterPetsState =
  | { status: typeof HUNTER_PETS_STATUS.loading }
  | { status: typeof HUNTER_PETS_STATUS.ready; data: HunterPetsData }
  | { status: typeof HUNTER_PETS_STATUS.error; retry: () => void };
