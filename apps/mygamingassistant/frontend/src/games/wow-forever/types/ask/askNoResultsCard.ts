import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskToolName } from "@/games/wow-forever/types/ask/askToolName";

/** A tool found nothing for what was asked. */
export interface AskNoResultsCard {
  kind: typeof ASK_CARD.noResults;
  tool: AskToolName;
  query: string;
}
