/**
 * LineupDetailPanel — side panel showing a single lineup's full detail.
 *
 * Opens when ?lineup=<id> is in the URL. Fetches the lineup via the existing
 * /api/lineups/{id} endpoint. Falls through gracefully when the lineup id is
 * unknown or its screenshots are absent (seed-data path).
 *
 * Layered on top of MapPage so the map stays visible. Closing via X / Esc /
 * outside-click delegates to the @platform/ui Panel primitive.
 */
import { X } from "lucide-react";
import Panel from "@platform/ui/components/ui/Panel";
import { useGetLineupQuery } from "@/store/lineupsApi";
import LineupCard from "@/components/lineup/LineupCard";
import type { usePins } from "@/hooks/usePins";

interface Props {
  lineupId: string;
  onClose: () => void;
  pins?: ReturnType<typeof usePins>;
}

export default function LineupDetailPanel({ lineupId, onClose, pins }: Props) {
  const { data: lineup, isLoading, isError } = useGetLineupQuery(lineupId);

  return (
    <Panel position="right" width="22rem" onClose={onClose}>
      <div className="flex items-center justify-between p-3 border-b sticky top-0 bg-card z-10">
        <h2 className="text-sm font-semibold truncate">
          {lineup?.title ?? (isLoading ? "Loading..." : "Lineup")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
          aria-label="Close lineup detail"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        {isLoading && (
          <div className="space-y-3">
            <div className="h-32 rounded-lg bg-muted/40 animate-pulse" />
            <div className="h-32 rounded-lg bg-muted/40 animate-pulse" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            Failed to load lineup. It may have been removed.
          </p>
        )}
        {lineup && (
          <LineupCard
            lineup={lineup}
            variant="expanded"
            isPinned={pins?.isPinned(lineup.id) ?? false}
            onPinToggle={
              pins
                ? () => {
                    if (pins.isPinned(lineup.id)) {
                      pins.unpin(lineup.id);
                    } else {
                      pins.pin(lineup.id);
                    }
                  }
                : undefined
            }
          />
        )}
      </div>
    </Panel>
  );
}
