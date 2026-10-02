import { useEffect, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import PoiRow from "@/games/wow-forever/components/worldMap/PoiRow";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { GROUP_HEADING } from "@/games/wow-forever/worldMap/describeRank";
import type { MapSearch, MapSearchView } from "@/games/wow-forever/worldMap/mapSearch";
import { scrollBehavior } from "@/games/wow-forever/lib/revealInViewport";

const PAGE_SIZE = 8;

interface MapSearchResultsProps {
  data: WorldMapData;
  faction: PlayerFaction;
  search: MapSearch;
  view: MapSearchView;
  /** You've said where you are: rows are nearest first, under "Near you" etc. */
  measured: boolean;
  includeOtherFaction: boolean;
  onIncludeOtherFactionChange: (value: boolean) => void;
  selectedPoiId: string | null;
  onToggle: (poiId: string) => void;
  onDirections: (poiId: string) => void;
  /** Zoom the map back out to every result. */
  onShowAll: () => void;
  onClear: () => void;
}

/** Every NPC a search matched ("warlock trainer"), each also marked on the map at any zoom. */
export default function MapSearchResults(props: MapSearchResultsProps) {
  const { data, faction, search, view, measured, selectedPoiId, onToggle, onDirections } = props;
  const { results, otherFactionCount } = view;
  const [limit, setLimit] = useState(PAGE_SIZE);
  // A marker clicked on the map: its row is listed even past "Show more".
  const selectedIndex = results.findIndex((r) => r.poi.id === selectedPoiId);
  const shownCount = Math.max(limit, selectedIndex + 1);
  const shown = results.slice(0, shownCount);

  // That row wasn't on the page when the marker was clicked, so the click couldn't scroll to it: do it now.
  const revealed = selectedIndex >= limit;
  useEffect(() => {
    if (selectedPoiId === null || !revealed) return;
    const quoted = selectedPoiId.replace(/["\\]/g, "\\$&");
    const row = document.querySelector<HTMLElement>(`#wm-search-results [data-poi-row="${quoted}"]`);
    row?.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() });
  }, [selectedPoiId, revealed]);

  return (
    <section id="wm-search-results" aria-labelledby="wm-search-results-heading" className="space-y-3 scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 id="wm-search-results-heading" className="text-lg font-semibold">
            “{search.query}” on the map
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
            {results.length === 1 ? "1 match" : `${results.length} matches`} — every one is marked on the map. Zoom in or click a
            marker to see which is which.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={props.onShowAll}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40"
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            Fit map to all
          </button>
          <button
            type="button"
            onClick={props.onClear}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40"
          >
            <X className="h-4 w-4" aria-hidden />
            Clear search
          </button>
        </div>
      </div>
      {(otherFactionCount > 0 || props.includeOtherFaction) && (
        <label className="flex items-center gap-2 text-sm min-h-[44px] sm:min-h-[32px]">
          <input
            type="checkbox"
            checked={props.includeOtherFaction}
            onChange={(e) => props.onIncludeOtherFactionChange(e.target.checked)}
            className="h-4 w-4"
          />
          Include the other faction{otherFactionCount > 0 && ` (${otherFactionCount} more)`}
        </label>
      )}
      <div className="space-y-3">
        {shown.map((ranked, i) => (
          <div key={ranked.poi.id} className="space-y-3">
            {measured && (i === 0 || shown[i - 1].group !== ranked.group) && (
              <h3 className="text-sm font-semibold text-muted-foreground">{GROUP_HEADING[ranked.group]}</h3>
            )}
            <PoiRow
              ranked={ranked}
              data={data}
              faction={faction}
              selected={ranked.poi.id === selectedPoiId}
              onToggle={onToggle}
              onDirections={onDirections}
            />
          </div>
        ))}
      </div>
      {results.length > shownCount && (
        <button
          type="button"
          onClick={() => setLimit(shownCount + PAGE_SIZE)}
          className="rounded-md border px-4 text-sm min-h-[44px] hover:bg-muted/40"
        >
          Show more ({results.length - shownCount} left)
        </button>
      )}
    </section>
  );
}
