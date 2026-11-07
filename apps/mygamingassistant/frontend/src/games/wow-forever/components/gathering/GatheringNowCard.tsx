import SkillColorTag from "@/games/wow-forever/components/gathering/SkillColorTag";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { itemIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { GatheringNow } from "@/games/wow-forever/types/gathering/gatheringNow";

interface GatheringNowCardProps {
  now: GatheringNow;
  /** "mine". */
  verb: string;
}

/** The nodes worth skill at your skill (orange / yellow) and the next one to unlock. */
export default function GatheringNowCard({ now, verb }: GatheringNowCardProps) {
  const worth = now.now.length > 0;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2" data-testid="gather-now">
      {worth && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {now.now.map(({ resolved, color }) => (
            <li key={resolved.node.node} className="flex flex-wrap items-center gap-2">
              <GameIcon icon={itemIcon(resolved.node.itemId)} size={24} alt="" />
              <span className="font-semibold">{resolved.node.node}</span>
              <SkillColorTag color={color} />
              {resolved.node.rare && <span className="text-xs text-muted-foreground">rare</span>}
            </li>
          ))}
        </ul>
      )}
      {!worth && <p className="text-sm">Nothing gives skill to {verb} at your skill — everything you can reach is green or gray.</p>}
      {now.next && (
        <p className="text-sm text-muted-foreground">
          Next unlock: <GameIcon icon={itemIcon(now.next.node.itemId)} size={16} alt="" className="mr-1" />
          <span className="font-medium text-foreground">{now.next.node.name}</span> at {now.next.thresholds.orange}
        </p>
      )}
    </div>
  );
}
