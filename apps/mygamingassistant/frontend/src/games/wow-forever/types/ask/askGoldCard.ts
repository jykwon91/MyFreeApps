import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskGoldTipRow } from "@/games/wow-forever/types/ask/askGoldTipRow";
import type { AskSpotRow } from "@/games/wow-forever/types/ask/askSpotRow";

/** `gold_farming`: the top tips for the level, and the best farm spots on a small map. */
export interface AskGoldCard {
  kind: typeof ASK_CARD.gold;
  level: number;
  tips: AskGoldTipRow[];
  rows: AskSpotRow[];
  pageHref: string;
}
