import { useMemo, useState } from "react";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import type { TravelSettingsState } from "@/games/wow-forever/hooks/useTravelSettings";
import type { FlightNode, PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { FLIGHT_MODE, type FlightMode } from "@/games/wow-forever/worldMap/directions";
import { usableFlightNodes } from "@/games/wow-forever/worldMap/flightRoutes";

const FLIGHT_OPTIONS: readonly { id: FlightMode; label: string }[] = [
  { id: FLIGHT_MODE.all, label: "All" },
  { id: FLIGHT_MODE.known, label: "Only ones I know" },
  { id: FLIGHT_MODE.none, label: "None" },
];

interface ZoneGroup {
  zoneName: string;
  nodes: FlightNode[];
}

interface ContinentGroup {
  continent: number;
  name: string;
  zones: ZoneGroup[];
  ids: number[];
}

/** "Thelsamar, Loch Modan" → "Thelsamar" (the zone is the group's heading). */
function placeName(node: FlightNode): string {
  return node.name.replace(/, [^,]+$/, "");
}

function groupByContinent(nodes: readonly FlightNode[], data: WorldMapData): ContinentGroup[] {
  const continents = new Map<number, Map<string, FlightNode[]>>();
  for (const node of nodes) {
    const zoneName = data.zoneById.get(node.zone)?.name ?? "Other";
    const zones = continents.get(node.continent) ?? new Map<string, FlightNode[]>();
    zones.set(zoneName, [...(zones.get(zoneName) ?? []), node]);
    continents.set(node.continent, zones);
  }
  return [...continents]
    .map(([continent, zones]) => ({
      continent,
      name: data.continentNames.get(continent) ?? "Other",
      zones: [...zones]
        .map(([zoneName, list]) => ({ zoneName, nodes: list.sort((a, b) => a.name.localeCompare(b.name)) }))
        .sort((a, b) => a.zoneName.localeCompare(b.zoneName)),
      ids: [...zones.values()].flat().map((n) => n.id),
    }))
    .sort((a, b) => a.continent - b.continent);
}

interface FlightPathChoiceProps {
  data: WorldMapData;
  faction: PlayerFaction;
  travel: TravelSettingsState;
}

/** All / only the flight paths you've found / none — new characters have to discover each one on foot. */
export default function FlightPathChoice({ data, faction, travel }: FlightPathChoiceProps) {
  const { settings, setFlights, setKnown } = travel;
  const nodes = useMemo(() => usableFlightNodes(data.flightNodes, faction), [data, faction]);
  const groups = useMemo(() => groupByContinent(nodes, data), [nodes, data]);
  const known = new Set(settings.knownFlightIds);
  const knownCount = nodes.filter((n) => known.has(n.id)).length;
  // Open the list the first time there's nothing ticked yet; after that it's the player's.
  const [startOpen] = useState(knownCount === 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-medium">Flight paths</span>
        <SegmentedToggle label="Flight paths" options={FLIGHT_OPTIONS} value={settings.flights} onChange={setFlights} className="flex-wrap" />
      </div>
      {settings.flights === FLIGHT_MODE.none && (
        <p className="text-sm text-muted-foreground">Routes use walking, boats, zeppelins and the Deeprun Tram.</p>
      )}
      {settings.flights === FLIGHT_MODE.known && (
        <>
          {knownCount === 0 && (
            <p className="text-sm text-muted-foreground">
              No flight paths ticked — routes use walking, boats, zeppelins and the tram until you tick the ones you've found.
            </p>
          )}
          <details open={startOpen} className="rounded-md border">
            <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm sm:min-h-[36px]">
              Your flight paths — {knownCount} of {nodes.length} ticked
            </summary>
            <div className="max-h-80 space-y-4 overflow-y-auto border-t p-3">
              {groups.map((group) => (
                <fieldset key={group.continent} className="space-y-2">
                  <legend className="flex w-full flex-wrap items-center gap-2 text-sm font-medium">
                    {group.name}
                    <button
                      type="button"
                      onClick={() => setKnown(group.ids, true)}
                      aria-label={`Tick all flight paths on ${group.name}`}
                      className="rounded-md border px-2 text-xs font-normal min-h-[44px] sm:min-h-[28px] hover:bg-muted/40"
                    >
                      Tick all
                    </button>
                    <button
                      type="button"
                      onClick={() => setKnown(group.ids, false)}
                      aria-label={`Untick all flight paths on ${group.name}`}
                      className="rounded-md border px-2 text-xs font-normal min-h-[44px] sm:min-h-[28px] hover:bg-muted/40"
                    >
                      Untick all
                    </button>
                  </legend>
                  {group.zones.map((zone) => (
                    <div key={zone.zoneName}>
                      <p className="text-xs text-muted-foreground">{zone.zoneName}</p>
                      <ul className="grid sm:grid-cols-2">
                        {zone.nodes.map((node) => (
                          <li key={node.id}>
                            <label className="flex min-h-[44px] items-center gap-2 text-sm sm:min-h-[32px]">
                              <input
                                type="checkbox"
                                checked={known.has(node.id)}
                                onChange={(e) => setKnown([node.id], e.target.checked)}
                                aria-label={node.name}
                                className="h-4 w-4"
                              />
                              {placeName(node)}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
