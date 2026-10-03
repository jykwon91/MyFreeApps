import { cn } from "@platform/ui";
import RaidIcon from "@/games/wow-forever/components/raid/RaidIcon";
import { classAccent } from "@/games/wow-forever/data/classAccents";
import { RAID_ICON } from "@/games/wow-forever/data/raidPage";
import { entryIconAlt } from "@/games/wow-forever/lib/raidLabels";
import type { RaidEntry } from "@/games/wow-forever/types/raid";

interface RaidEntryRowProps {
  entry: RaidEntry;
  iconsVersion: string;
}

/**
 * A player as the post shows them: order number, spec (else class) icon, name. Late: the clock icon, and "late" to a
 * screen reader. In the queue: struck through, with "queued". A long name truncates; its `title` holds it whole.
 */
export default function RaidEntryRow({ entry, iconsVersion }: RaidEntryRowProps) {
  return (
    <li className="flex min-h-[36px] items-center gap-2 py-1.5 pr-3 text-sm">
      <span
        className="h-5 w-[3px] shrink-0 rounded-r"
        style={{ backgroundColor: classAccent(entry.wow_class) }}
        aria-hidden
      />
      {entry.number !== null && (
        <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{entry.number}</span>
      )}
      {entry.icon && <RaidIcon name={entry.icon} version={iconsVersion} alt={entryIconAlt(entry)} />}
      {/* No class yet: keep the icon's place, so names line up down the card. */}
      {!entry.icon && <span className="h-5 w-5 shrink-0" aria-hidden />}
      <span
        title={entry.name}
        className={cn("min-w-0 flex-1 truncate", entry.queued && "text-muted-foreground line-through")}
      >
        {entry.name}
      </span>
      {entry.late && (
        <span title="Late" className="inline-flex shrink-0">
          <RaidIcon name={RAID_ICON.LATE} version={iconsVersion} alt="" />
          <span className="sr-only">late</span>
        </span>
      )}
      {entry.queued && <span className="shrink-0 text-xs text-muted-foreground">queued</span>}
    </li>
  );
}
