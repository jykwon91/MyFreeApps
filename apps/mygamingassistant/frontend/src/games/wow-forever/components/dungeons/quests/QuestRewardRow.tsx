import clsx from "clsx";
import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { QUALITY_TEXT_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { rewardCountText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { QuestReward } from "@/games/wow-forever/types/dungeons/questReward";

/** One reward item: icon, name (hover for its tooltip, tap for its page) and how many. */
export default function QuestRewardRow({ reward }: { reward: QuestReward }) {
  const icon = itemIcon(reward.id);
  const count = rewardCountText(reward.count);
  return (
    <li className="flex items-center gap-3 py-1 min-h-[44px]" data-testid="quest-reward-row">
      <GameIcon icon={icon} size={24} alt="" />
      <ItemNameLink
        itemId={reward.id}
        name={reward.name}
        className={clsx("min-w-0 flex-1 text-sm font-medium break-words", icon?.quality ? QUALITY_TEXT_CLASSES[icon.quality] : null)}
      />
      {count ? <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{count}</span> : null}
    </li>
  );
}
