import { useState } from "react";
import { Select } from "@platform/ui";
import { RotateCcw } from "lucide-react";
import PoiRow from "@/games/wow-forever/components/worldMap/PoiRow";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { GROUP_HEADING } from "@/games/wow-forever/worldMap/describeRank";
import type { Directions } from "@/games/wow-forever/worldMap/directions";
import { NEAR_GROUP, type RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import { findFilterGroups, type ServiceFilter } from "@/games/wow-forever/worldMap/serviceFilters";

const PAGE_SIZE = 8;

interface FindServicesProps {
  data: WorldMapData;
  faction: PlayerFaction;
  classId: WowClassId;
  filter: ServiceFilter;
  onFilterChange: (id: string) => void;
  showAllClasses: boolean;
  onShowAllClassesChange: (value: boolean) => void;
  includeOtherFaction: boolean;
  onIncludeOtherFactionChange: (value: boolean) => void;
  /** False when the filters (and the map layers) are at their defaults and nothing is selected. */
  canReset: boolean;
  /** Default filters and no selection — never the You section. */
  onReset: () => void;
  results: readonly RankedPoi[];
  selectedPoiId: string | null;
  onToggle: (poiId: string) => void;
  directions: Directions | null | undefined;
}

/** Pick any service type and list every one, nearest first, in the three distance groups. */
export default function FindServices(props: FindServicesProps) {
  const { data, faction, classId, filter, results, selectedPoiId, onToggle, directions } = props;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = results.slice(0, limit);

  return (
    <section aria-labelledby="wm-find" className="space-y-3">
      <h2 id="wm-find" className="text-lg font-semibold">
        Find
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor="wm-find-kind" className="sr-only">
          What are you looking for?
        </label>
        <Select
          id="wm-find-kind"
          value={filter.id}
          onChange={(e) => {
            props.onFilterChange(e.target.value);
            setLimit(PAGE_SIZE);
          }}
          className="min-h-[44px] bg-card sm:w-64"
        >
          {findFilterGroups(classId).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.filters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        {filter.id === SERVICE_KIND.classTrainer && (
          <label className="flex items-center gap-2 text-sm min-h-[44px]">
            <input
              type="checkbox"
              checked={props.showAllClasses}
              onChange={(e) => props.onShowAllClassesChange(e.target.checked)}
              className="h-4 w-4"
            />
            Show every class's trainers
          </label>
        )}
        <label className="flex items-center gap-2 text-sm min-h-[44px]">
          <input
            type="checkbox"
            checked={props.includeOtherFaction}
            onChange={(e) => props.onIncludeOtherFactionChange(e.target.checked)}
            className="h-4 w-4"
          />
          Include the other faction
        </label>
        <button
          type="button"
          onClick={() => {
            props.onReset();
            setLimit(PAGE_SIZE);
          }}
          disabled={!props.canReset}
          title="Back to class trainers, default map layers, nothing selected — your faction, class, zone and level stay"
          className="inline-flex items-center gap-1.5 self-start rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] sm:self-auto hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Reset filters
        </button>
      </div>
      {results.length === 0 && <p className="text-sm text-muted-foreground">None found for your faction.</p>}
      <div className="space-y-3">
        {shown.map((ranked, i) => (
          <div key={ranked.poi.id} className="space-y-3">
            {(i === 0 || shown[i - 1].group !== ranked.group) && (
              <h3 className="text-sm font-semibold text-muted-foreground">{GROUP_HEADING[ranked.group]}</h3>
            )}
            <PoiRow
              ranked={ranked}
              data={data}
              faction={faction}
              selected={ranked.poi.id === selectedPoiId}
              onToggle={onToggle}
              directions={directions}
            />
          </div>
        ))}
      </div>
      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="rounded-md border px-4 text-sm min-h-[44px] hover:bg-muted/40"
        >
          Show more ({results.length - limit} left)
        </button>
      )}
      {results.some((r) => r.group === NEAR_GROUP.otherContinent) && results.length <= limit && (
        <p className="text-xs text-muted-foreground">Other-continent results need a boat or zeppelin — open Directions for the route.</p>
      )}
    </section>
  );
}
