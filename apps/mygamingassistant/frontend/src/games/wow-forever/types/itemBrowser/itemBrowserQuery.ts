import type { ItemBrowserFilters } from "@/games/wow-forever/types/itemBrowser/itemBrowserFilters";
import type { ItemBrowserView } from "@/games/wow-forever/types/itemBrowser/itemBrowserView";
import type { SortDirection } from "@/games/wow-forever/types/itemBrowser/itemSortDirection";
import type { ItemSortKey } from "@/games/wow-forever/types/itemBrowser/itemSortKey";

/** Everything the item browser keeps in the URL. */
export interface ItemBrowserQuery {
  filters: ItemBrowserFilters;
  sort: ItemSortKey;
  direction: SortDirection;
  view: ItemBrowserView;
  /** How many pages of results "Show more" has opened (1 = the first page). */
  pages: number;
}
