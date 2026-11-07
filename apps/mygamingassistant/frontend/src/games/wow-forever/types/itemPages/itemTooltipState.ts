import type { ItemTooltipData } from "@/games/wow-forever/types/itemPages/itemTooltipData";

/** An item tooltip's data while its shard loads; "missing" = the item isn't in the Forever files. */
export type ItemTooltipState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; data: ItemTooltipData };
