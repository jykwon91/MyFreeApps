import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { describeClientItem } from "@/games/wow-forever/lib/describeClientItem";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** Search results, each a link to its item page. */
export default function ItemFinderResults({ items }: { items: readonly ClientItem[] }) {
  return (
    <ul className="space-y-1" aria-label="Matching items">
      {items.map((item) => (
        <li key={item.id} className="flex min-h-[44px] items-center gap-2 px-1 py-1">
          <GameIcon icon={itemIcon(item.id)} size={24} alt="" className="shrink-0" />
          <div className="min-w-0">
            <ItemNameLink itemId={item.id} name={item.name} item={item} className={`text-sm font-medium ${QUALITY_TEXT_CLASSES[item.quality]}`} />
            <p className="text-xs text-muted-foreground truncate">{describeClientItem(item)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
