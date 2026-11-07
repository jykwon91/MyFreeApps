/**
 * The player's own marks and route, per map — pure, so the hook only stores
 * what these return. Every input (a stored value, a shared link) is untrusted:
 * labels are cleaned, coordinates clamped to the map, counts capped.
 */
import {
  MAX_MARK_LABEL_LENGTH,
  MAX_MARKS_PER_MAP,
  MAX_MARKS_TOTAL,
  MAX_ROUTE_STOPS,
} from "@/games/wow-forever/data/worldMap/mapMarks";
import { DEFAULT_MAP_MARK_STYLE, isMapMarkStyle, markStyleDef, type MapMarkStyle } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import { cleanUserText } from "@/games/wow-forever/lib/cleanUserText";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import type { MapMarks } from "@/games/wow-forever/types/mapMarks/mapMarks";
import type { MapMarksStore } from "@/games/wow-forever/types/mapMarks/mapMarksStore";
import type { SavedSharedMarks } from "@/games/wow-forever/types/mapMarks/savedSharedMarks";

export const EMPTY_MAP_MARKS: MapMarks = { marks: [], route: [] };
export const EMPTY_MAP_MARKS_STORE: MapMarksStore = { maps: {} };

/** Ids we make are short letters/digits; anything else in a stored value is dropped. */
const MARK_ID = /^[a-z0-9]{1,24}$/i;
const MAX_MAP_ID = 1_000_000;

/** A map coordinate as kept: on the map (0..100), one decimal like the in-game coordinate addons. */
export function roundMapCoord(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/** A label as stored and shown: one clean line, at most the max length; empty = the style's default label. */
export function cleanMarkLabel(raw: string, style: MapMarkStyle): string {
  return cleanUserText(raw, MAX_MARK_LABEL_LENGTH) || markStyleDef(style).defaultLabel;
}

export function marksOn(store: MapMarksStore, mapId: number): MapMarks {
  return store.maps[mapId] ?? EMPTY_MAP_MARKS;
}

export function totalMarks(store: MapMarksStore): number {
  return Object.values(store.maps).reduce((sum, m) => sum + m.marks.length, 0);
}

/** How many more marks this map can take (per-map and overall caps). */
export function roomForMarks(store: MapMarksStore, mapId: number): number {
  return Math.max(0, Math.min(MAX_MARKS_PER_MAP - marksOn(store, mapId).marks.length, MAX_MARKS_TOTAL - totalMarks(store)));
}

function withMap(store: MapMarksStore, mapId: number, change: (marks: MapMarks) => MapMarks): MapMarksStore {
  const next = change(marksOn(store, mapId));
  const maps: Record<number, MapMarks> = { ...store.maps };
  if (next.marks.length === 0) delete maps[mapId];
  else maps[mapId] = next;
  return { maps };
}

/** A new mark at (x, y); the store unchanged when the map (or every map) is full. */
export function addMark(store: MapMarksStore, mapId: number, mark: MapMark): MapMarksStore {
  if (roomForMarks(store, mapId) === 0) return store;
  const clean: MapMark = {
    id: mark.id,
    x: roundMapCoord(mark.x),
    y: roundMapCoord(mark.y),
    style: mark.style,
    label: cleanMarkLabel(mark.label, mark.style),
  };
  return withMap(store, mapId, (m) => ({ ...m, marks: [...m.marks, clean] }));
}

/** Rename and / or restyle one mark. */
export function updateMark(
  store: MapMarksStore,
  mapId: number,
  id: string,
  patch: { label?: string; style?: MapMarkStyle },
): MapMarksStore {
  return withMap(store, mapId, (m) => ({
    ...m,
    marks: m.marks.map((mark) => {
      if (mark.id !== id) return mark;
      const style = patch.style ?? mark.style;
      return { ...mark, style, label: cleanMarkLabel(patch.label ?? mark.label, style) };
    }),
  }));
}

/** Delete a mark — and its stop in the route. */
export function deleteMark(store: MapMarksStore, mapId: number, id: string): MapMarksStore {
  return withMap(store, mapId, (m) => ({ marks: m.marks.filter((mark) => mark.id !== id), route: m.route.filter((r) => r !== id) }));
}

/** Add a mark to the end of the route (each mark at most once, at most the max stops). */
export function addToRoute(store: MapMarksStore, mapId: number, id: string): MapMarksStore {
  const current = marksOn(store, mapId);
  if (current.route.includes(id) || current.route.length >= MAX_ROUTE_STOPS || !current.marks.some((m) => m.id === id)) return store;
  return withMap(store, mapId, (m) => ({ ...m, route: [...m.route, id] }));
}

export function removeRouteStop(store: MapMarksStore, mapId: number, index: number): MapMarksStore {
  return withMap(store, mapId, (m) => ({ ...m, route: m.route.filter((_, i) => i !== index) }));
}

/** Move the stop at `index` by `delta` places (−1 = earlier); a move past either end does nothing. */
export function moveRouteStop(store: MapMarksStore, mapId: number, index: number, delta: number): MapMarksStore {
  const target = index + delta;
  const route = marksOn(store, mapId).route;
  if (index < 0 || index >= route.length || target < 0 || target >= route.length) return store;
  return withMap(store, mapId, (m) => {
    const next = [...m.route];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    return { ...m, route: next };
  });
}

export function clearRoute(store: MapMarksStore, mapId: number): MapMarksStore {
  return withMap(store, mapId, (m) => ({ ...m, route: [] }));
}

/** Put a whole map's marks back as they were (Undo after a delete or a cleared route). */
export function restoreMapMarks(store: MapMarksStore, mapId: number, marks: MapMarks): MapMarksStore {
  return withMap(store, mapId, () => marks);
}

/** A route's stops as marks, in order (ids that name no mark are skipped). */
export function routeMarks(marks: MapMarks): MapMark[] {
  const byId = new Map(marks.marks.map((m) => [m.id, m]));
  return marks.route.flatMap((id) => byId.get(id) ?? []);
}

function sameSpot(a: MapMark, b: MapMark): boolean {
  return a.label === b.label && a.x === b.x && a.y === b.y;
}

/**
 * "Save to my marks": the shared marks are ADDED to yours, never replacing
 * any. One you already have (same label + spot) isn't added twice. The shared
 * route is taken only when you have no route on that map, so yours is never
 * overwritten either.
 */
export function saveSharedMarks(
  store: MapMarksStore,
  mapId: number,
  shared: MapMarks,
  makeId: () => string,
): SavedSharedMarks {
  let next = store;
  let added = 0;
  let duplicates = 0;
  let noRoom = 0;
  // Shared id -> the id that mark has in your store (a new one, or the copy you already had).
  const ids = new Map<string, string>();
  for (const mark of shared.marks) {
    const existing = marksOn(next, mapId).marks.find((m) => sameSpot(m, mark));
    if (existing) {
      duplicates += 1;
      ids.set(mark.id, existing.id);
      continue;
    }
    if (roomForMarks(next, mapId) === 0) {
      noRoom += 1;
      continue;
    }
    const id = makeId();
    next = addMark(next, mapId, { ...mark, id });
    ids.set(mark.id, id);
    added += 1;
  }
  if (marksOn(store, mapId).route.length === 0) {
    for (const stop of shared.route) {
      const id = ids.get(stop);
      if (id) next = addToRoute(next, mapId, id);
    }
  }
  return { store: next, added, duplicates, noRoom };
}

function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What "Save to my marks" says it did: "Saved 3 marks to your marks. 1 you already had." */
export function savedSharedMessage(result: Omit<SavedSharedMarks, "store">): string {
  const parts = [
    result.added > 0 ? `Saved ${countOf(result.added, "mark", "marks")} to your marks.` : "No new marks to save.",
    result.duplicates > 0 ? `${countOf(result.duplicates, "was", "were")} already yours.` : "",
    result.noRoom > 0 ? `${countOf(result.noRoom, "mark didn't", "marks didn't")} fit — this map is full.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function parseMark(raw: unknown): MapMark | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !MARK_ID.test(r.id)) return null;
  if (typeof r.x !== "number" || typeof r.y !== "number" || !Number.isFinite(r.x) || !Number.isFinite(r.y)) return null;
  const style = isMapMarkStyle(r.style) ? r.style : DEFAULT_MAP_MARK_STYLE;
  const label = typeof r.label === "string" ? r.label : "";
  return { id: r.id, x: roundMapCoord(r.x), y: roundMapCoord(r.y), style, label: cleanMarkLabel(label, style) };
}

/** One map's stored marks: bad marks dropped, ids unique, caps applied, route stops naming a kept mark (once each). */
export function parseMapMarks(raw: unknown): MapMarks | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const marks = (Array.isArray(r.marks) ? r.marks : []).flatMap((m): MapMark[] => {
    const mark = parseMark(m);
    if (!mark || seen.has(mark.id)) return [];
    seen.add(mark.id);
    return [mark];
  });
  const kept = marks.slice(0, MAX_MARKS_PER_MAP);
  const keptIds = new Set(kept.map((m) => m.id));
  const route: string[] = [];
  for (const stop of Array.isArray(r.route) ? r.route : []) {
    if (typeof stop === "string" && keptIds.has(stop) && !route.includes(stop) && route.length < MAX_ROUTE_STOPS) route.push(stop);
  }
  return kept.length ? { marks: kept, route } : null;
}

/** The stored value as a store: unknown or bad maps dropped, the overall cap applied map by map. */
export function parseMapMarksStore(raw: unknown): MapMarksStore | null {
  if (typeof raw !== "object" || raw === null) return null;
  const stored = (raw as Record<string, unknown>).maps;
  if (typeof stored !== "object" || stored === null) return null;
  const maps: Record<number, MapMarks> = {};
  let total = 0;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    const mapId = Number(key);
    if (!Number.isInteger(mapId) || mapId <= 0 || mapId > MAX_MAP_ID) continue;
    const marks = parseMapMarks(value);
    if (!marks || total + marks.marks.length > MAX_MARKS_TOTAL) continue;
    maps[mapId] = marks;
    total += marks.marks.length;
  }
  return { maps };
}
