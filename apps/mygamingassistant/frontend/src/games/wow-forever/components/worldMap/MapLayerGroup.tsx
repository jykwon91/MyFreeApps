import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import MapLayerToggle from "@/games/wow-forever/components/worldMap/MapLayerToggle";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { MAP_LAYER_DEF_BY_ID } from "@/games/wow-forever/data/worldMap/layerCatalog";
import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import type { LayerCounts } from "@/games/wow-forever/types/mapLayers/layerCounts";
import type { LazyLayerSource } from "@/games/wow-forever/types/mapLayers/lazyLayerSource";
import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapLayerGroup as LayerGroup } from "@/games/wow-forever/types/mapLayers/mapLayerGroup";
import { layerLabel } from "@/games/wow-forever/worldMap/layerMarkers";

interface MapLayerGroupProps {
  group: LayerGroup;
  choice: MapLayerChoice;
  counts: LayerCounts;
  classId: WowClassId;
  /** Lazy layer files that didn't load. */
  failedSources: ReadonlySet<LazyLayerSource>;
  onSetLayers: (ids: readonly MapLayerId[], on: boolean) => void;
  onRetryLoad: () => void;
}

const SMALL_BUTTON = "rounded px-2 text-xs underline-offset-2 hover:underline min-h-[44px] sm:min-h-[32px]";

/** A heading (open / close, how many are on, All / None) and its layer toggles. */
export default function MapLayerGroup({ group, choice, counts, classId, failedSources, onSetLayers, onRetryLoad }: MapLayerGroupProps) {
  const [open, setOpen] = useState(group.openByDefault);
  const listId = useId();
  const on = group.layers.filter((id) => choice[id]).length;
  return (
    <div className="border-t pt-1 first:border-t-0">
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-semibold min-h-[44px] sm:min-h-[32px]"
        >
          <ChevronDown aria-hidden className={clsx("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
          <span className="min-w-0 truncate">{group.label}</span>
          <span className="text-xs font-normal text-muted-foreground">· {on} on</span>
        </button>
        <button type="button" aria-label={`Show all ${group.label}`} onClick={() => onSetLayers(group.layers, true)} className={SMALL_BUTTON}>
          All
        </button>
        <button type="button" aria-label={`Hide all ${group.label}`} onClick={() => onSetLayers(group.layers, false)} className={SMALL_BUTTON}>
          None
        </button>
      </div>
      <fieldset id={listId} hidden={!open} className="space-y-0 pb-1 pl-1">
        <legend className="sr-only">{group.label}</legend>
        {group.layers.map((id) => {
          const def = MAP_LAYER_DEF_BY_ID.get(id);
          if (!def) return null;
          return (
            <MapLayerToggle
              key={id}
              def={def}
              label={layerLabel(def, classId)}
              checked={choice[id]}
              count={counts[id]}
              failed={failedSources.has(def.source.kind as LazyLayerSource)}
              onChange={(value) => onSetLayers([id], value)}
              onRetry={onRetryLoad}
            />
          );
        })}
      </fieldset>
    </div>
  );
}
