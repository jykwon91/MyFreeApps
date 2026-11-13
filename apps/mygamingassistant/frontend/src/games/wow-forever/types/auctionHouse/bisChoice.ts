import type { BisRank } from "@/games/wow-forever/types/auctionHouse/bisRank";

/** `?bis=` — any of the top three picks, or exactly the 1st, 2nd or 3rd. */
export type BisChoice = "any" | BisRank;
