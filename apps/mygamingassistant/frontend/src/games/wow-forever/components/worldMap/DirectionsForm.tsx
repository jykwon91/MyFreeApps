import { ArrowUpDown, Map as MapIcon, X } from "lucide-react";
import DirectionsPanel, { type DirectionsWalk } from "@/games/wow-forever/components/worldMap/DirectionsPanel";
import EndpointField, { type FieldShortcut } from "@/games/wow-forever/components/worldMap/EndpointField";
import FlightPathChoice from "@/games/wow-forever/components/worldMap/FlightPathChoice";
import { DIRECTIONS_HEADING_ID, FROM_FIELD_ID } from "@/games/wow-forever/components/worldMap/plannerIds";
import type { TravelSettingsState } from "@/games/wow-forever/hooks/useTravelSettings";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import type { Directions } from "@/games/wow-forever/worldMap/directions";
import type { Place } from "@/games/wow-forever/worldMap/places";
import type { SearchContext } from "@/games/wow-forever/worldMap/search";
import {
  FACTION_NAME,
  MY_LOCATION,
  PICK_TARGET,
  type PickTarget,
  type ResolvedEnd,
  type TripStart,
} from "@/games/wow-forever/worldMap/trip";

interface DirectionsFormProps {
  data: WorldMapData;
  places: readonly Place[];
  context: SearchContext;
  faction: PlayerFaction;
  travel: TravelSettingsState;
  /** The saved zone, for bare coordinates. */
  currentZoneId: number | null;
  from: ResolvedEnd | null;
  /** Remounts the From box when the start changes (Swap, a map pick). */
  fromKey: string;
  fromIsMe: boolean;
  to: ResolvedEnd;
  toKey: string;
  /** "Goldshire" — the saved location, for the "Your location" pick; null when nothing's saved. */
  myLocationLabel: string | null;
  /** undefined until there's a start; null when no route connects them. */
  directions: Directions | null | undefined;
  walk: DirectionsWalk;
  onSetFrom: (end: TripStart) => void;
  onSetTo: (end: TripStart) => void;
  onSwap: () => void;
  onChooseOnMap: (target: PickTarget) => void;
  onSetAsMyLocation: () => void;
  onClose: () => void;
  onShowMap: () => void;
}

const CHOOSE_ON_MAP = "map";

/** From / To like a maps app, with the steps under them. From starts as "Your location". */
export default function DirectionsForm(props: DirectionsFormProps) {
  const { from, to, directions, fromIsMe, myLocationLabel } = props;

  const fromShortcuts: FieldShortcut[] = [];
  if (myLocationLabel) fromShortcuts.push({ id: MY_LOCATION, primary: "Your location", secondary: myLocationLabel });
  fromShortcuts.push({ id: CHOOSE_ON_MAP, primary: "Choose on map", secondary: "Click where you're starting" });
  const toShortcuts: FieldShortcut[] = [{ id: CHOOSE_ON_MAP, primary: "Choose on map", secondary: "Click where you're going" }];

  function fromShortcut(id: string) {
    if (id === MY_LOCATION) props.onSetFrom(MY_LOCATION);
    else props.onChooseOnMap(PICK_TARGET.start);
  }

  const context = { data: props.data, places: props.places, context: props.context, currentZoneId: props.currentZoneId };
  const steps = directions?.steps.length ?? 0;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={DIRECTIONS_HEADING_ID} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
          Directions
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close directions"
          className="-m-1 inline-flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
          Close
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <EndpointField
            key={props.fromKey}
            id={FROM_FIELD_ID}
            label="From"
            placeholder="Town, NPC or coordinates"
            initialText={from?.title ?? ""}
            {...context}
            onChoose={props.onSetFrom}
            shortcuts={fromShortcuts}
            onShortcut={fromShortcut}
          />
          <EndpointField
            key={props.toKey}
            id="wm-to"
            label="To"
            placeholder="Town, NPC or coordinates"
            initialText={to.title}
            {...context}
            onChoose={props.onSetTo}
            shortcuts={toShortcuts}
            onShortcut={() => props.onChooseOnMap(PICK_TARGET.destination)}
          />
        </div>
        <button
          type="button"
          onClick={props.onSwap}
          disabled={!from}
          aria-label="Swap start and destination"
          title="Swap start and destination"
          className="mt-6 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border hover:bg-muted/40 disabled:opacity-40"
        >
          <ArrowUpDown className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {from && <span className="text-muted-foreground">{from.detail}</span>}
        {from && !fromIsMe && (
          <button type="button" onClick={props.onSetAsMyLocation} className="underline min-h-[44px] sm:min-h-[32px]">
            Set as my location
          </button>
        )}
        <button
          type="button"
          onClick={props.onShowMap}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 lg:hidden"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
          Show on map
        </button>
      </div>
      {to.note && <p className="text-sm text-muted-foreground">{to.note}</p>}
      <FlightPathChoice data={props.data} faction={props.faction} travel={props.travel} />
      <div className="border-t pt-3">
        {!from && <p className="text-sm text-muted-foreground">Enter a starting point to see directions.</p>}
        {from && directions === null && (
          <p className="text-sm">
            I couldn't find a route from {from.title} to {to.title} for {FACTION_NAME[props.faction]}. Walking, the flight
            paths you've chosen, boats, zeppelins and the tram don't connect them.
          </p>
        )}
        {directions && <DirectionsPanel directions={directions} walk={props.walk} />}
      </div>
      <p aria-live="polite" className="sr-only">
        {directions && `Route ready: ${steps} ${steps === 1 ? "step" : "steps"}`}
      </p>
    </div>
  );
}
