import LineupCard from "@/components/lineup/LineupCard";
import { usePins } from "@/hooks/usePins";
import type { Lineup } from "@/types/game";

export interface PlanModeThumbnailResultsProps {
  lineups: Lineup[];
  pins: ReturnType<typeof usePins>;
}

export default function PlanModeThumbnailResults({
  lineups,
  pins,
}: PlanModeThumbnailResultsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {lineups.map((lineup) => (
        <LineupCard
          key={lineup.id}
          lineup={lineup}
          variant="thumbnail"
          isPinned={pins.isPinned(lineup.id)}
          onPinToggle={() => {
            if (pins.isPinned(lineup.id)) {
              pins.unpin(lineup.id);
            } else {
              pins.pin(lineup.id);
            }
          }}
        />
      ))}
    </div>
  );
}
