import { useState } from "react";
import clsx from "clsx";
import ZoneMap from "@/games/wow-forever/components/worldMap/ZoneMap";
import type { WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { directionStops, resultMarkers, viewedZone } from "@/games/wow-forever/worldMap/mapLayers";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

interface MapPanelProps {
  data: WorldMapData;
  model: WorldMapModel;
  onPick: (zoneId: number, x: number, y: number) => void;
  onSelect: (poiId: string) => void;
}

/** The map beside the list: your zone, or the destination's zone when you switch to it. */
export default function MapPanel({ data, model, onPick, onSelect }: MapPanelProps) {
  const [pickedZoneId, setPickedZoneId] = useState<number | null>(null);
  const zone = viewedZone(model, data, pickedZoneId);
  const destinationZone = model.selected?.zone;
  const choices: WorldZone[] = [model.zone];
  if (destinationZone && destinationZone.id !== model.zone.id) choices.push(destinationZone);

  return (
    <section aria-labelledby="wm-map" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="wm-map" className="text-lg font-semibold">
          Map: {zone.name}
        </h2>
        {choices.length > 1 && (
          <div role="group" aria-label="Which map" className="flex gap-2">
            {choices.map((z, i) => (
              <button
                key={z.id}
                type="button"
                aria-pressed={z.id === zone.id}
                onClick={() => setPickedZoneId(z.id)}
                className={clsx(
                  "rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px]",
                  z.id === zone.id && "bg-primary text-primary-foreground",
                )}
              >
                {i === 0 && "Your zone"}
                {i > 0 && `Destination: ${z.name}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <ZoneMap
        key={zone.id}
        zone={zone}
        player={model.player.world}
        markers={resultMarkers(model)}
        selectedId={model.selected?.poi.id ?? null}
        destination={model.selected ? { world: model.selected.world, label: model.selected.poi.name } : null}
        stops={directionStops(model, data)}
        onPick={(x, y) => {
          setPickedZoneId(null);
          onPick(zone.id, x, y);
        }}
        onSelectMarker={onSelect}
      />
    </section>
  );
}
