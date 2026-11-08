import type { ITEM_INDEX_STATUS } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import type { ItemIndex } from "@/games/wow-forever/types/itemBrowser/itemIndex";

/** The item index's load state (its own lazy chunk). */
export type ItemIndexState =
  | { status: typeof ITEM_INDEX_STATUS.loading }
  | { status: typeof ITEM_INDEX_STATUS.ready; data: ItemIndex }
  | { status: typeof ITEM_INDEX_STATUS.error; retry: () => void };
