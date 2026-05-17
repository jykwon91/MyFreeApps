import { Link } from "react-router-dom";
import { usePins } from "@/hooks/usePins";
import type { Lineup } from "@/types/game";
import PlanModeExpandedResults from "./PlanModeExpandedResults";
import PlanModeThumbnailResults from "./PlanModeThumbnailResults";

export interface LineupResultsPanelProps {
  fetching: boolean;
  lineups: Lineup[];
  activeCardIndex: number;
  pins: ReturnType<typeof usePins>;
  addLineupHref: string;
  targetZoneName: string;
}

export default function LineupResultsPanel({
  fetching,
  lineups,
  activeCardIndex,
  pins,
  addLineupHref,
  targetZoneName,
}: LineupResultsPanelProps) {
  if (fetching) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (lineups.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-muted-foreground">No lineups match this filter.</p>
        <Link to={addLineupHref} className="text-sm text-primary hover:underline">
          Add lineup for {targetZoneName}
        </Link>
      </div>
    );
  }

  if (lineups.length <= 3) {
    return (
      <PlanModeExpandedResults
        lineups={lineups}
        activeCardIndex={activeCardIndex}
        pins={pins}
      />
    );
  }

  return <PlanModeThumbnailResults lineups={lineups} pins={pins} />;
}
