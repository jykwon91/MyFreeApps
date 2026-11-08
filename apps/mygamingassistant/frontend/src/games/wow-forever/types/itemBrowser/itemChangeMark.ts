import type { ITEM_CHANGE } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";

/** A change the browser can filter on (never "none"). */
export type ItemChangeMark = typeof ITEM_CHANGE.changed | typeof ITEM_CHANGE.new;
