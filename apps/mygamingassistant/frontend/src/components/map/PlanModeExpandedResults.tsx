import LineupCard from "@/components/lineup/LineupCard";
import { usePins } from "@/hooks/usePins";
import type { Lineup } from "@/types/game";

export interface PlanModeExpandedResultsProps {
  lineups: Lineup[];
  activeCardIndex: number;
  pins: ReturnType<typeof usePins>;
}

export default function PlanModeExpandedResults({
  lineups,
  activeCardIndex,
  pins,
}: PlanModeExpandedResultsProps) {
  return (
    <div className="space-y-4">
      {lineups.map((lineup, i) => (
        <div
          key={lineup.id}
          className={[
            "rounded-xl transition-all duration-150",
            i === activeCardIndex ? "ring-2 ring-primary" : "",
          ].join(" ")}
        >
          <LineupCard
            lineup={lineup}
            variant="expanded"
            isPinned={pins.isPinned(lineup.id)}
            onPinToggle={() => {
              if (pins.isPinned(lineup.id)) {
                pins.unpin(lineup.id);
              } else {
                pins.pin(lineup.id);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
