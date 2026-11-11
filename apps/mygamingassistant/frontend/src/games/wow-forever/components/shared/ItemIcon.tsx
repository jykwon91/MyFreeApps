import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { GameIconSize } from "@/games/wow-forever/types/icons/gameIconSize";

interface ItemIconProps {
  itemId: number;
  size?: GameIconSize;
}

/** An item's icon, decorative, sitting inline right before its printed name. */
export default function ItemIcon({ itemId, size = 16 }: ItemIconProps) {
  return <GameIcon icon={itemIcon(itemId)} size={size} alt="" className="mr-1.5 -mt-0.5" />;
}
