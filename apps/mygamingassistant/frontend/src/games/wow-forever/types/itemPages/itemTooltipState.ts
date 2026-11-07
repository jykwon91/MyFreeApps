import type { ITEM_TOOLTIP_STATUS } from "@/games/wow-forever/data/itemPages/itemTooltipStatus";
import type { ItemTooltipData } from "@/games/wow-forever/types/itemPages/itemTooltipData";

type Status = typeof ITEM_TOOLTIP_STATUS;

/** An item tooltip's data while its shard loads; MISSING = the item isn't in the Forever files. */
export type ItemTooltipState =
  | { status: Status["LOADING"] }
  | { status: Status["ERROR"] }
  | { status: Status["MISSING"] }
  | { status: Status["READY"]; data: ItemTooltipData };
