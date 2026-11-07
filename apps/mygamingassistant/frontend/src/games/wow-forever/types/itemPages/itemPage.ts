import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ItemPageFacts } from "@/games/wow-forever/types/itemPages/itemPageFacts";
import type { ItemPageSources } from "@/games/wow-forever/types/itemPages/itemPageSources";

/** Everything one item page shows. */
export interface ItemPage {
  item: ClientItem;
  facts: ItemPageFacts;
  sources: ItemPageSources;
  clientBuild: string;
}
