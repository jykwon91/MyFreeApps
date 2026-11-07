import type { ITEM_PAGE_RESULT } from "@/games/wow-forever/types/itemPages/itemPageResultKind";
import type { ItemPage } from "@/games/wow-forever/types/itemPages/itemPage";

/** An item page's data: the item, a Classic item no Forever client has shown yet, or no such item. */
export type ItemPageResult =
  | { kind: typeof ITEM_PAGE_RESULT.found; page: ItemPage }
  | { kind: typeof ITEM_PAGE_RESULT.unseen; id: number; name: string }
  | { kind: typeof ITEM_PAGE_RESULT.unknown; id: number | null };
