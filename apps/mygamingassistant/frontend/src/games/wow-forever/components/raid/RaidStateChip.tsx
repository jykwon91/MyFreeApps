import { cn } from "@platform/ui";
import { RAID_STATE_DOT, RAID_STATE_LABEL } from "@/games/wow-forever/data/raidPage";
import type { RaidState } from "@/games/wow-forever/types/raid";

interface RaidStateChipProps {
  state: RaidState;
}

/** "● Open", "● Sign-ups closed"… — the words carry the state; the dot only repeats it. */
export default function RaidStateChip({ state }: RaidStateChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      <span className={cn("h-2 w-2 rounded-full", RAID_STATE_DOT[state])} aria-hidden />
      {RAID_STATE_LABEL[state]}
    </span>
  );
}
