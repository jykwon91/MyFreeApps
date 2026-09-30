import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DESTINATION_DIRECTIONS_ID,
  DIRECTIONS_HEADING_ID,
  FROM_FIELD_ID,
  PLANNER_SEARCH_ID,
} from "@/games/wow-forever/components/worldMap/plannerIds";
import { MAP_PARAM } from "@/games/wow-forever/hooks/useMapView";
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useTrip } from "@/games/wow-forever/hooks/useTrip";
import type { PlayerFaction, WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import { planDirections, type Directions, type TravelOptions } from "@/games/wow-forever/worldMap/directions";
import { directionStops, type MapFit, type MapRoute } from "@/games/wow-forever/worldMap/mapLayers";
import type { Place } from "@/games/wow-forever/worldMap/places";
import {
  commonMap,
  ENDPOINT_KIND,
  formatEndpoint,
  myLocationEnd,
  myLocationPoint,
  MY_LOCATION,
  PICK_TARGET,
  pointTitle,
  resolveEndpoint,
  type Endpoint,
  type PickTarget,
  type ResolvedEnd,
  type TripStart,
} from "@/games/wow-forever/worldMap/trip";
import type { WorldMapModel } from "@/games/wow-forever/worldMap/worldMapModel";

interface TripPlannerInput {
  data: WorldMapData | null;
  places: readonly Place[];
  faction: PlayerFaction;
  /** Which flight paths routes may use. */
  travel: TravelOptions;
  model: WorldMapModel | null;
  updateSettings: (patch: Partial<PlayerSettings>) => void;
}

export interface TripPlanner {
  to: ResolvedEnd | null;
  toKey: string;
  from: ResolvedEnd | null;
  fromKey: string;
  fromIsMe: boolean;
  /** The trip's To doesn't exist on the map (a stale link). */
  linkMissing: boolean;
  directionsOpen: boolean;
  /** undefined until directions are open with a start; null when nothing connects the ends. */
  directions: Directions | null | undefined;
  /** "Near Goldshire" for the saved location; null when there isn't one. */
  myLocationLabel: string | null;
  route: MapRoute | null;
  fit: MapFit | null;
  clearFit: () => void;
  picking: PickTarget | null;
  setTo: (end: TripStart) => void;
  setFrom: (end: TripStart) => void;
  openDirections: () => void;
  /** A result row's "Directions": it becomes To and the directions open. */
  directionsTo: (poiId: string) => void;
  closeDirections: () => void;
  clear: () => void;
  swap: () => void;
  chooseOnMap: (target: PickTarget) => void;
  pickPoint: (zoneId: number, x: number, y: number) => void;
  cancelPick: () => void;
  setAsMyLocation: () => void;
}

/** Move focus once the next render is on screen (a changed trip re-renders the planner). */
function focusSoon(id: string) {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
}

/**
 * The route planner's state and actions: the trip (in the URL) resolved
 * against the map data, the directions between its ends, what the map
 * draws for it, and where the map looks when it changes.
 */
export function useTripPlanner({ data, places, faction, travel, model, updateSettings }: TripPlannerInput): TripPlanner {
  const trip = useTrip();
  const [params] = useSearchParams();
  const [fit, setFit] = useState<MapFit | null>(null);
  const [picking, setPicking] = useState<PickTarget | null>(null);

  const resolve = useCallback(
    (end: TripStart | null): ResolvedEnd | null => {
      if (!data || !end) return null;
      if (end !== MY_LOCATION) return resolveEndpoint(end, data, places, faction);
      return model ? myLocationEnd(model.playerEnd, places, data) : null;
    },
    [data, places, faction, model],
  );

  const to = useMemo(() => resolve(trip.to), [resolve, trip.to]);
  const from = useMemo(() => resolve(trip.from), [resolve, trip.from]);
  const plan = useCallback(
    (start: ResolvedEnd | null, end: ResolvedEnd | null) =>
      data && start && end ? planDirections(start.route, end.route, faction, data, travel) : undefined,
    [data, faction, travel],
  );
  const directions = useMemo(
    () => (trip.directionsOpen ? plan(from, to) : undefined),
    [trip.directionsOpen, plan, from, to],
  );

  const route = useMemo<MapRoute | null>(() => {
    if (!data || !to) return null;
    const origin = trip.directionsOpen && from ? { world: from.route.world, label: from.title } : null;
    return {
      origin,
      destination: { world: to.route.world, label: to.title },
      stops: origin ? directionStops(directions ?? null, data) : [],
    };
  }, [data, to, from, trip.directionsOpen, directions]);

  /** Where the map looks for the trip: the destination's map, or with directions open the smallest map holding the whole route. */
  const fitFor = useCallback(
    (end: ResolvedEnd | null, start: ResolvedEnd | null, open: boolean): MapFit | null => {
      if (!data || !end) return null;
      let mapId = end.route.place.zoneId;
      let points: WorldPoint[] = end.pinpoint ? [end.route.world] : [];
      if (open && start) {
        const stops = directionStops(plan(start, end) ?? null, data).map((s) => s.world);
        points = [start.route.world, end.route.world, ...stops];
        mapId = commonMap(data, start.route.place.zoneId, mapId, points);
      }
      return data.maps.has(mapId) ? { mapId, points, nonce: Date.now() } : null;
    },
    [data, plan],
  );

  /** Fit the map to the trip; the map to put in the URL with the trip change. */
  function show(end: ResolvedEnd | null, start: ResolvedEnd | null, open: boolean): number | undefined {
    const next = fitFor(end, start, open);
    setFit(next);
    return next?.mapId;
  }

  // A linked trip (`?to=` / `?npc=` / a shared URL) opens on it once; after that the page is the player's.
  const [linkShown, setLinkShown] = useState(false);
  const [linkMapId, setLinkMapId] = useState<number | null>(null);
  if (to && !linkShown) {
    setLinkShown(true);
    const linkFit = params.has(MAP_PARAM) ? null : fitFor(to, from, trip.directionsOpen);
    setFit(linkFit);
    setLinkMapId(linkFit?.mapId ?? null);
  }
  if (linkMapId !== null && params.has(MAP_PARAM)) setLinkMapId(null);
  // ...and puts its map in the URL, so Back and sharing keep it.
  const { change } = trip;
  useEffect(() => {
    if (linkMapId !== null) change({ mapId: linkMapId }, { replace: true });
  }, [linkMapId, change]);

  function setTo(end: TripStart) {
    const next: Endpoint | null = end === MY_LOCATION ? (model && myLocationPoint(model.playerEnd)) : end;
    const resolved = resolve(next);
    if (!next || !resolved) return;
    setLinkShown(true);
    setPicking(null);
    trip.change({ to: next, mapId: show(resolved, from, trip.directionsOpen) });
    if (!trip.directionsOpen) focusSoon(DESTINATION_DIRECTIONS_ID);
  }

  function setFrom(end: TripStart) {
    setPicking(null);
    trip.change({ from: end, directions: true, mapId: show(to, resolve(end), true) });
  }

  function openDirections() {
    trip.change({ directions: true, mapId: show(to, from, true) });
    focusSoon(from ? DIRECTIONS_HEADING_ID : FROM_FIELD_ID);
  }

  function directionsTo(poiId: string) {
    const end: Endpoint = { kind: ENDPOINT_KIND.npc, poiId };
    const resolved = resolve(end);
    if (!resolved) return;
    setLinkShown(true);
    setPicking(null);
    trip.change({ to: end, directions: true, mapId: show(resolved, from, true) });
    focusSoon(from ? DIRECTIONS_HEADING_ID : FROM_FIELD_ID);
    window.requestAnimationFrame(() =>
      document.getElementById(DIRECTIONS_HEADING_ID)?.scrollIntoView?.({ block: "nearest" }),
    );
  }

  function closeDirections() {
    setPicking(null);
    trip.change({ directions: false, mapId: show(to, null, false) });
    focusSoon(DESTINATION_DIRECTIONS_ID);
  }

  function clear() {
    setPicking(null);
    trip.change({ to: null });
    focusSoon(PLANNER_SEARCH_ID);
  }

  function swap() {
    if (!trip.to || !from) return;
    const newTo: Endpoint | null = trip.from === MY_LOCATION ? (model && myLocationPoint(model.playerEnd)) : trip.from;
    if (!newTo) return;
    trip.change({ from: trip.to, to: newTo, mapId: show(resolve(newTo), to, true) }, { replace: true });
  }

  function pickPoint(zoneId: number, x: number, y: number) {
    const end: Endpoint = { kind: ENDPOINT_KIND.point, zoneId, x, y };
    if (picking === PICK_TARGET.start) setFrom(end);
    else setTo(end);
  }

  function setAsMyLocation() {
    if (!from) return;
    const { zoneId, x, y } = from.route.place;
    updateSettings({ zoneId, position: { x, y } });
    trip.change({ from: MY_LOCATION }, { replace: true });
  }

  // "Choose on map": Esc leaves it (before Esc clears a selection or zooms out).
  useEffect(() => {
    if (!picking) return;
    function escape(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setPicking(null);
    }
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [picking]);

  const clearFit = useCallback(() => setFit(null), []);
  const cancelPick = useCallback(() => setPicking(null), []);
  const myZone = model?.zone;
  const myPlace = model?.playerEnd.place;
  const myLocationLabel = myZone && myPlace ? pointTitle(myZone, myPlace.x, myPlace.y, places) : null;

  return {
    to,
    toKey: trip.to ? formatEndpoint(trip.to) : "",
    from,
    fromKey: `${trip.from === MY_LOCATION ? MY_LOCATION : formatEndpoint(trip.from)}|${from?.title ?? ""}`,
    fromIsMe: trip.from === MY_LOCATION,
    linkMissing: Boolean(data && trip.to && !to),
    directionsOpen: trip.directionsOpen && to !== null,
    directions,
    myLocationLabel,
    route,
    fit,
    clearFit,
    picking,
    setTo,
    setFrom,
    openDirections,
    directionsTo,
    closeDirections,
    clear,
    swap,
    chooseOnMap: setPicking,
    pickPoint,
    cancelPick,
    setAsMyLocation,
  };
}
