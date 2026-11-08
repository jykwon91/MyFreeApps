import clsx from "clsx";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { LibraryRewardItem } from "@/games/wow-forever/types/library/libraryRewardItem";

/** One reward: icon, name (hover for its tooltip, tap for its page) and slot. */
export default function LibraryRewardItemRow({ item }: { item: LibraryRewardItem }) {
  return (
    <li className="flex items-center gap-3 py-1.5 min-h-[44px]" data-testid="library-reward-item">
      <GameIcon icon={itemIcon(item.id)} size={24} alt="" />
      <div className="min-w-0 flex-1">
        <ItemNameLink
          itemId={item.id}
          name={item.count > 1 ? `${item.name} ×${item.count}` : item.name}
          className={clsx("text-sm font-medium break-words", QUALITY_TEXT_CLASSES[item.quality])}
        />
        {item.slot ? <p className="text-xs text-muted-foreground">{SLOT_LABELS[item.slot]}</p> : null}
      </div>
    </li>
  );
}
