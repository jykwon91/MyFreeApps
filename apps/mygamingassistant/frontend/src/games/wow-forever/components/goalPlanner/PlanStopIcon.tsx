import { Coins } from "lucide-react";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { itemIcon, professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";

/** A stop's picture: the recipe or book it's for, else its profession; the auction house gets coins. */
export default function PlanStopIcon({ stop }: { stop: PlanStop }) {
  if (stop.itemId !== null) return <GameIcon icon={itemIcon(stop.itemId)} size={32} alt="" />;
  if (stop.profession !== null) return <GameIcon icon={professionIcon(stop.profession)} size={32} alt="" />;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border bg-muted/40" aria-hidden>
      <Coins className="h-4 w-4 text-amber-500" />
    </span>
  );
}
