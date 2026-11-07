import { forwardRef, useState } from "react";
import { X } from "lucide-react";
import LevelFitControl from "@/games/wow-forever/components/worldMap/LevelFitControl";
import MapLayerGroup from "@/games/wow-forever/components/worldMap/MapLayerGroup";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { MAP_LAYER_DEF_BY_ID, MAP_LAYER_GROUPS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import type { MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import type { LayerCounts } from "@/games/wow-forever/types/mapLayers/layerCounts";
import type { MapLayerSettings } from "@/games/wow-forever/types/mapLayers/mapLayerSettings";
import type { MapView } from "@/games/wow-forever/types/worldMap";
import { layerCountText, layerLabel } from "@/games/wow-forever/worldMap/layerMarkers";

export interface MapLayersPanelProps {
  mapName: string;
  settings: MapLayerSettings;
  counts: LayerCounts;
  classId: WowClassId;
  gatheringFailed: boolean;
  onSetLayers: (ids: readonly MapLayerId[], on: boolean) => void;
  onRetryGathering: () => void;
  level: number | null;
  onLevelChange: (level: number | null) => void;
  onLevelFitChange: (on: boolean) => void;
  continentView: boolean;
  continent: MapView | null;
  onOpen: (mapId: number) => void;
  /** "Show all on the map" search results are drawn instead of the layers. */
  searchActive: boolean;
  onClose: () => void;
}

/** What one toggle did, for screen readers: "Flight masters shown — 3 on this map". */
function announcement(ids: readonly MapLayerId[], on: boolean, counts: LayerCounts, classId: WowClassId): string {
  const verb = on ? "shown" : "hidden";
  if (ids.length !== 1) return `${ids.length} layers ${verb}`;
  const def = MAP_LAYER_DEF_BY_ID.get(ids[0]);
  if (!def) return "";
  return `${layerLabel(def, classId)} ${verb} — ${layerCountText(counts[ids[0]], false)} on this map`;
}

/** The Layers panel: "Where to level", then each group of layers with its counts for the viewed map. */
const MapLayersPanel = forwardRef<HTMLHeadingElement, MapLayersPanelProps>(function MapLayersPanel(props, headingRef) {
  const { settings, counts, classId } = props;
  const [status, setStatus] = useState("");

  function setLayers(ids: readonly MapLayerId[], on: boolean) {
    props.onSetLayers(ids, on);
    setStatus(announcement(ids, on, counts, classId));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold focus:outline-none">
          Layers <span className="text-xs font-normal text-muted-foreground">on {props.mapName}</span>
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close layers"
          className="inline-flex items-center justify-center rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px]"
        >
          <span className="sm:hidden">Done</span>
          <X aria-hidden className="hidden h-4 w-4 sm:block" />
        </button>
      </div>
      <LevelFitControl
        level={props.level}
        onLevelChange={props.onLevelChange}
        enabled={settings.levelFit}
        onEnabledChange={props.onLevelFitChange}
        continentView={props.continentView}
        continent={props.continent}
        onOpen={props.onOpen}
      />
      {props.searchActive && (
        <p className="text-xs text-muted-foreground">Layers are hidden while the search's "Show all on the map" results are drawn.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Your faction and neutral only. NPC, quest and node spots: <ProvenanceBadge provenance={PROVENANCE.classic} />
      </p>
      {MAP_LAYER_GROUPS.map((group) => (
        <MapLayerGroup
          key={group.id}
          group={group}
          choice={settings.layers}
          counts={counts}
          classId={classId}
          gatheringFailed={props.gatheringFailed}
          onSetLayers={setLayers}
          onRetryGathering={props.onRetryGathering}
        />
      ))}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
});

export default MapLayersPanel;
