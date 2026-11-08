import ItemChangeTag from "@/games/wow-forever/components/itemBrowser/ItemChangeTag";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { itemLevelText, itemSlotText } from "@/games/wow-forever/lib/itemBrowser/itemMetaText";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

/** One item in the grid view: a bigger icon over the name, slot / type, levels and its Forever mark. */
export default function ItemBrowserCard({ item }: { item: ItemIndexEntry }) {
  return (
    <li className="flex min-w-0 gap-3 rounded-xl border bg-card p-3" data-testid="item-browser-card">
      <GameIcon icon={itemIcon(item.id)} size={48} alt="" />
      <div className="min-w-0 flex-1 space-y-1">
        <ItemNameLink
          itemId={item.id}
          name={item.name}
          className={`inline-flex min-h-[44px] items-center break-words font-medium leading-tight ${QUALITY_TEXT_CLASSES[item.quality]}`}
        />
        <p className="text-xs text-muted-foreground">{itemSlotText(item)}</p>
        <p className="text-xs text-muted-foreground">{itemLevelText(item)}</p>
        <ItemChangeTag change={item.change} />
      </div>
    </li>
  );
}
