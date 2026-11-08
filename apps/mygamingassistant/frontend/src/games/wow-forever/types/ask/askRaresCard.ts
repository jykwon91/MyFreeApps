import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { AskSpotRow } from "@/games/wow-forever/types/ask/askSpotRow";

/** `find_rares`: rares that fit a level, nearest the zone first, on a small map. */
export interface AskRaresCard {
  kind: typeof ASK_CARD.rares;
  level: number;
  /** Where "near" was measured from; null = nowhere. */
  origin: AskOrigin | null;
  rows: AskSpotRow[];
  /** Every rare that fits the level, before the cut to `rows`. */
  total: number;
  /** The Rares page with the same level band. */
  pageHref: string;
}
