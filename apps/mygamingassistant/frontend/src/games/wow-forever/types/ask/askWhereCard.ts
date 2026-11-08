import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";

/** The answer needs to know where the player is: a "Where are you?" picker. */
export interface AskWhereCard {
  kind: typeof ASK_CARD.where;
}
