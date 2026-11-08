import type { RARES_STATUS } from "@/games/wow-forever/data/rares/raresConfig";
import type { RaresData } from "@/games/wow-forever/types/rares/raresData";

/** The rares data's load state (its own lazy chunks). */
export type RaresState =
  | { status: typeof RARES_STATUS.idle }
  | { status: typeof RARES_STATUS.loading }
  | { status: typeof RARES_STATUS.ready; data: RaresData }
  | { status: typeof RARES_STATUS.error; retry: () => void };
