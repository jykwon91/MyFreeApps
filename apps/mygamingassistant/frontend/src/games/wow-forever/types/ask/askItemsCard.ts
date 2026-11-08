import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** `search_items`: items by name, each linking to its item page. */
export interface AskItemsCard {
  kind: typeof ASK_CARD.items;
  query: string;
  items: ClientItem[];
  total: number;
}
