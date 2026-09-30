import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";
import { nearestTown, placeLabel, type Place } from "@/games/wow-forever/worldMap/places";
import { relatedMaps } from "@/games/wow-forever/worldMap/where";

interface WhereSummaryProps {
  data: WorldMapData;
  places: readonly Place[];
  zoneId: number | null;
  position: { x: number; y: number } | null;
  /** The spot is a town's centre, not coordinates read off the game. */
  approximate: boolean;
  /** Bare coordinates were put on the zone already picked — offer the city / zone sharing its ground. */
  onCurrentZone: boolean;
  onMoveMap: (mapId: number) => void;
}

function sentence(data: WorldMapData, places: readonly Place[], props: WhereSummaryProps): string {
  const { zoneId, position, approximate } = props;
  const zone = zoneId === null ? undefined : data.zoneById.get(zoneId);
  if (!zone) return "Not set yet — type where you are, or pick your zone.";
  if (!position) return `You're in ${zone.name} — measuring from the middle of the map.`;
  const town = nearestTown(places, zone.id, position.x, position.y);
  const coords = `${formatCoord(position.x)}, ${formatCoord(position.y)} on the ${zone.name} map`;
  if (approximate && town) return `You're around ${placeLabel(town)} (the middle of town).`;
  if (town) return `You're near ${placeLabel(town)} · ${coords}.`;
  return `You're at ${coords}.`;
}

/** Where the page thinks you are, in words — always visible, announced when it changes. */
export default function WhereSummary(props: WhereSummaryProps) {
  const { data, places, zoneId, position, onCurrentZone, onMoveMap } = props;
  const zone = zoneId === null ? undefined : data.zoneById.get(zoneId);
  const alternatives = onCurrentZone && zone && position ? relatedMaps(zone, data) : [];
  return (
    <div className="space-y-1">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {sentence(data, places, props)}
      </p>
      {alternatives.map((map) => (
        <button
          key={map.id}
          type="button"
          onClick={() => onMoveMap(map.id)}
          className="text-sm underline underline-offset-2 min-h-[44px] sm:min-h-0 text-left"
        >
          Read those inside {map.name}? Use the {map.name} map
        </button>
      ))}
    </div>
  );
}
