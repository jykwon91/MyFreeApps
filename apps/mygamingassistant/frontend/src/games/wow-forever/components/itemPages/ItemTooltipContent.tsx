import ItemStatsBlock from "@/games/wow-forever/components/itemPages/ItemStatsBlock";
import ItemTooltipSkeleton from "@/games/wow-forever/components/itemPages/ItemTooltipSkeleton";
import { NO_ITEM_FACTS } from "@/games/wow-forever/data/itemPages/itemTooltipConfig";
import { ITEM_TOOLTIP_STATUS } from "@/games/wow-forever/data/itemPages/itemTooltipStatus";
import { ITEM_TOOLTIP_NOTE as NOTE } from "@/games/wow-forever/data/itemPages/itemTooltipStyles";
import { useItemTooltipData } from "@/games/wow-forever/hooks/useItemTooltipData";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

interface ItemTooltipContentProps {
  itemId: number;
  /** The item when the page already holds it: its stats show at once, the bind line follows. */
  item?: ClientItem;
}

/** An open tooltip's body: the in-game stats block, a skeleton while it loads, or why there are no stats. */
export default function ItemTooltipContent({ itemId, item }: ItemTooltipContentProps) {
  const state = useItemTooltipData(itemId);
  if (state.status === ITEM_TOOLTIP_STATUS.READY) {
    return <ItemStatsBlock item={item ?? state.data.item} facts={state.data.facts} showVendorPrice={false} className="shadow-lg" />;
  }
  if (item) {
    const facts = state.status === ITEM_TOOLTIP_STATUS.LOADING ? null : NO_ITEM_FACTS;
    return <ItemStatsBlock item={item} facts={facts} showVendorPrice={false} className="shadow-lg" />;
  }
  if (state.status === ITEM_TOOLTIP_STATUS.LOADING) return <ItemTooltipSkeleton />;
  if (state.status === ITEM_TOOLTIP_STATUS.MISSING) return <p className={NOTE}>No stats for this item in the Forever game files yet.</p>;
  return <p className={NOTE}>Couldn't load this item's stats. Hover again to retry.</p>;
}
