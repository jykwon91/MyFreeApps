import { cn } from "@platform/ui";
import { RefreshCw } from "lucide-react";
import { RAID_BUTTON_CLASS } from "@/games/wow-forever/data/raidPage";
import type { RaidPageProblem } from "@/games/wow-forever/lib/raidPageError";
import { updatedLabel } from "@/games/wow-forever/lib/raidTime";

interface RaidUpdatedBarProps {
  /** When the raid was last read; undefined before the first read lands. */
  fetchedAt: number | undefined;
  now: number;
  isFetching: boolean;
  /** Why the last re-read failed, while what's shown is from before it. */
  problem: RaidPageProblem | null;
  onRefresh: () => void;
}

/** "Updated 20 seconds ago" and [Refresh], spinning while it reads. The page also re-reads every minute in view. */
export default function RaidUpdatedBar({ fetchedAt, now, isFetching, problem, onRefresh }: RaidUpdatedBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span>{updatedText(fetchedAt, now)}</span>
      <button type="button" onClick={onRefresh} disabled={isFetching} className={RAID_BUTTON_CLASS}>
        <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden />
        Refresh
      </button>
      {problem && (
        <span role="status" className="text-red-700 dark:text-red-300">
          Couldn't refresh: {problem.message}
        </span>
      )}
    </div>
  );
}

function updatedText(fetchedAt: number | undefined, now: number): string {
  if (fetchedAt === undefined) return "";
  return updatedLabel(fetchedAt, now);
}
