import type { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { BisPick } from "@/games/wow-forever/types/auctionHouse/bisPick";

/** The top picks for the player's class and level, once the gear data they are worked out from has loaded. */
export type AuctionBisState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void; retrying: boolean }
  | { status: typeof LOAD_STATUS.ready; picks: ReadonlyMap<number, BisPick> };
