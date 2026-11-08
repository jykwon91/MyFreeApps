import ItemChangeTag from "@/games/wow-forever/components/itemBrowser/ItemChangeTag";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { itemLevelText, itemSlotText } from "@/games/wow-forever/lib/itemBrowser/itemMetaText";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

/** One item in the list view: icon, quality-coloured name (link + tooltip), slot / type, levels and its Forever mark. */
export default function ItemBrowserRow({ item }: { item: ItemIndexEntry }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 sm:px-4" data-testid="item-browser-row">
      <GameIcon icon={itemIcon(item.id)} size={32} alt="" />
      <div className="min-w-0 flex-1">
        <ItemNameLink
          itemId={item.id}
          name={item.name}
          className={`inline-flex min-h-[44px] items-center break-words font-medium sm:min-h-[32px] ${QUALITY_TEXT_CLASSES[item.quality]}`}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-xs text-muted-foreground">
            {itemSlotText(item)} · {itemLevelText(item)}
          </p>
          <ItemChangeTag change={item.change} />
        </div>
      </div>
    </li>
  );
}
