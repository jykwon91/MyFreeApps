import { cn } from "@platform/ui";
import RaidIcon from "@/games/wow-forever/components/raid/RaidIcon";
import { classAccent } from "@/games/wow-forever/data/classAccents";
import { RAID_ICON } from "@/games/wow-forever/data/raidPage";
import { entryIconAlt } from "@/games/wow-forever/lib/raidLabels";
import type { PlanPlayer } from "@/games/wow-forever/types/raidPlan";

/** The copy under the pointer while a player is dragged: raised off the page. */
const LIFTED_CLASS = "h-full w-full cursor-grabbing rounded-md border bg-card px-1 shadow-lg";

interface PlayerChipFaceProps {
  player: PlanPlayer;
  iconsVersion: string;
  /** The copy that follows the pointer while they're dragged — hidden from screen readers, which hear the moves. */
  lifted?: boolean;
}

/** A player as the post shows them: their class's colour, spec (else class) icon, name, and the clock when late. */
export default function PlayerChipFace({ player, iconsVersion, lifted = false }: PlayerChipFaceProps) {
  return (
    <span aria-hidden={lifted} className={cn("flex min-w-0 flex-1 items-center gap-2 text-sm", lifted && LIFTED_CLASS)}>
      <span
        className="h-5 w-[3px] shrink-0 rounded-r"
        style={{ backgroundColor: classAccent(player.wow_class) }}
        aria-hidden
      />
      {player.icon && <RaidIcon name={player.icon} version={iconsVersion} alt={entryIconAlt(player)} />}
      {/* No class yet: keep the icon's place, so names line up. */}
      {!player.icon && <span className="h-5 w-5 shrink-0" aria-hidden />}
      <span title={player.name} className="min-w-0 flex-1 truncate">
        {player.name}
      </span>
      {player.late && (
        <span title="Late" className="inline-flex shrink-0">
          <RaidIcon name={RAID_ICON.LATE} version={iconsVersion} alt="" />
          <span className="sr-only">late</span>
        </span>
      )}
    </span>
  );
}
