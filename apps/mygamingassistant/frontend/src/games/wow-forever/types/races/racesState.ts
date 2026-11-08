import type { RACES_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import type { RacesData } from "@/games/wow-forever/types/races/racesData";

/** The races data's load state (its own lazy chunks). */
export type RacesState =
  | { status: typeof RACES_STATUS.loading }
  | { status: typeof RACES_STATUS.ready; data: RacesData }
  | { status: typeof RACES_STATUS.error; retry: () => void };
