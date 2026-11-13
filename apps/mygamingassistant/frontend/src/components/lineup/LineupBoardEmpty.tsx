import { buildEmptyMessage } from "@/lib/lineup/buildEmptyMessage";
import type { LineupBoardEmptyProps } from "@/types/lineup/lineupBoardEmptyProps";

/** What the lineup boards show when no lineup matches: why, and a nudge when filters are on. */
export default function LineupBoardEmpty({ mapName, side, filteredUtils }: LineupBoardEmptyProps) {
  const isFiltered = filteredUtils.length > 0 || side !== "any";
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <p className="text-sm text-muted-foreground text-center">
        {buildEmptyMessage(mapName, side, filteredUtils)}
      </p>
      {isFiltered && (
        <span className="text-xs text-muted-foreground">
          Try clearing filters in the top bar.
        </span>
      )}
    </div>
  );
}
