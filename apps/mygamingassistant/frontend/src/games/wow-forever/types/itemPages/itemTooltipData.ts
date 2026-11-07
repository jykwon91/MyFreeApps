import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ItemPageFacts } from "@/games/wow-forever/types/itemPages/itemPageFacts";

/** What an item-name tooltip shows: the item and its Forever facts (bind line). */
export interface ItemTooltipData {
  item: ClientItem;
  facts: ItemPageFacts;
}
