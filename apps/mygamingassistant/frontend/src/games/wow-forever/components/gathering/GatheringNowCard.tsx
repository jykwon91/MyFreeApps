import SkillColorTag from "@/games/wow-forever/components/gathering/SkillColorTag";
import type { GatheringNow } from "@/games/wow-forever/types/gathering/gatheringNow";

interface GatheringNowCardProps {
  now: GatheringNow;
  /** "mine". */
  verb: string;
}

/** The nodes worth skill at your skill (orange / yellow) and the next one to unlock. */
export default function GatheringNowCard({ now, verb }: GatheringNowCardProps) {
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2" data-testid="gather-now">
      {now.now.length ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {now.now.map(({ resolved, color }) => (
            <li key={resolved.node.node} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{resolved.node.node}</span>
              <SkillColorTag color={color} />
              {resolved.node.rare ? <span className="text-xs text-muted-foreground">rare</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">Nothing gives skill to {verb} at your skill — everything you can reach is green or gray.</p>
      )}
      {now.next ? (
        <p className="text-sm text-muted-foreground">
          Next unlock: <span className="font-medium text-foreground">{now.next.node.name}</span> at {now.next.thresholds.orange}
        </p>
      ) : null}
    </div>
  );
}
