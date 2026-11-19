import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { WRIT_UNKNOWN_ITEM } from "@/games/wow-forever/data/professions/writs/writsCopy";
import type { WritRecord } from "@/games/wow-forever/types/writs/writRecord";

/** The item a writ asks for: a link with its icon, or plain "Unknown item" (and the quest's name for it) when none was matched. */
export default function WritItemCell({ writ }: { writ: WritRecord }) {
  if (!writ.product) {
    return (
      <div className="min-w-0 text-sm text-muted-foreground" data-testid="writ-item-unknown">
        <span className="italic">{WRIT_UNKNOWN_ITEM}</span>
        <span className="block break-words text-xs">{writ.productName}</span>
      </div>
    );
  }
  return (
    <ItemNameLink
      itemId={writ.product.id}
      name={writ.product.name}
      withIcon
      className="inline-flex min-h-[44px] items-center gap-2 text-sm lg:min-h-0"
    />
  );
}
