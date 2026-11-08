import clsx from "clsx";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { chanceText, lootKindText } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";

/** One item a boss drops: icon, name (hover for its tooltip, tap for its page), what it is and its drop chance. */
export default function BossLootRow({ item }: { item: BossLootItem }) {
  const icon = itemIcon(item.id);
  const kind = lootKindText(item);
  return (
    <li className="flex items-center gap-3 py-1.5 min-h-[44px]" data-testid="boss-loot-row">
      <GameIcon icon={icon} size={24} alt="" />
      <div className="min-w-0 flex-1">
        <ItemNameLink
          itemId={item.id}
          name={item.name}
          className={clsx("text-sm font-medium break-words", icon?.quality ? QUALITY_TEXT_CLASSES[icon.quality] : null)}
        />
        {kind ? <p className="text-xs text-muted-foreground">{kind}</p> : null}
      </div>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {chanceText(item.chance)}
        <span className="sr-only"> drop chance</span>
      </span>
    </li>
  );
}
