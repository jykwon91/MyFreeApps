import {
  MAP_VIEW_FRAGMENT_KEY,
  MAP_VIEW_FRAGMENT_VERSION,
  MAX_MAP_VIEW_FRAGMENT_LENGTH,
  MAX_MARKS_PER_MAP,
  MAX_ROUTE_STOPS,
  WORLD_MAP_PAGE_PATH,
} from "@/games/wow-forever/data/worldMap/mapMarks";
import { DEFAULT_MAP_MARK_STYLE, MAP_MARK_STYLES } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import { MAP_LAYER_IDS, type MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { MAP_LAYER_SHARE_CODES } from "@/games/wow-forever/data/worldMap/mapLayerShareCodes";
import { MAX_MAP_SCALE } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import type { SharedMapView } from "@/games/wow-forever/types/mapMarks/sharedMapView";
import { cleanMarkLabel, roundMapCoord, routeMarks } from "@/games/wow-forever/worldMap/mapMarks";

/*
 * "Share this view" fragment, version 1:
 *
 *   #view=1~<map>~<scale>.<cx>.<cy>~<layer>.<layer>…~<mark>_<mark>…~<stop>.<stop>…
 *   #view=1~1429~250.420.655~fm.in~423,651,r,Hogger_500,500,p,Camp~0.1
 *
 * - map: the uiMapID.
 * - view: zoom × 100 (100 = the whole picture … 400) and the centre × 1000 (0..1000 across / down).
 * - layers: the short codes of the layers that are on (`MAP_LAYER_SHARE_CODES`); empty = none.
 * - marks: x × 10, y × 10 (0..1000 = 0..100.0), the style's one-letter code and
 *   the percent-encoded label (incl. `~!'()*_`, so it can hold any text).
 * - route: indexes into the marks, in order.
 *
 * Nothing here ever goes to a server.
 */

const PREFIX = `${MAP_VIEW_FRAGMENT_KEY}=`;
const SEPARATOR = "~";
const FIELD_COUNT = 6;
/** Index of the marks field — the only one that can hold "%". */
const MARKS_FIELD = 4;
const ENCODED_SEPARATOR = /%7E/i;
const ENCODED_SEPARATOR_TEXT = "%7E";
const LIST_SEPARATOR = ".";
const MARK_SEPARATOR = "_";
const MARK_FIELD_SEPARATOR = ",";
const MARK_FIELD_COUNT = 4;
/** Characters encodeURIComponent leaves alone that would break a split or a chat app's link detection. */
const EXTRA_ESCAPES = /[~!'()*_]/g;
const DIGITS = /^\d{1,7}$/;
const COORD = /^\d{1,4}$/;
const COORD_STEPS = 1000;
const SCALE_STEPS = 100;

const CODE_TO_LAYER = new Map<string, MapLayerId>(MAP_LAYER_IDS.map((id) => [MAP_LAYER_SHARE_CODES[id], id]));
const CODE_TO_STYLE = new Map(MAP_MARK_STYLES.map((s) => [s.code, s.id]));
const STYLE_TO_CODE = new Map(MAP_MARK_STYLES.map((s) => [s.id, s.code]));

function encodeLabel(label: string): string {
  return encodeURIComponent(label).replace(EXTRA_ESCAPES, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** `view=1~…` (no "#"), ready for a URL's fragment. */
export function encodeMapViewFragment(view: SharedMapView): string {
  const { viewport } = view;
  const scale = Math.round(clamp(viewport.scale, 1, MAX_MAP_SCALE) * SCALE_STEPS);
  const cx = Math.round(clamp(viewport.centerX, 0, 1) * COORD_STEPS);
  const cy = Math.round(clamp(viewport.centerY, 0, 1) * COORD_STEPS);
  const layers = MAP_LAYER_IDS.filter((id) => view.layers[id]).map((id) => MAP_LAYER_SHARE_CODES[id]);
  const marks = view.marks.marks.slice(0, MAX_MARKS_PER_MAP);
  const index = new Map(marks.map((m, i) => [m.id, i]));
  const markRows = marks.map((m) =>
    [Math.round(roundMapCoord(m.x) * 10), Math.round(roundMapCoord(m.y) * 10), STYLE_TO_CODE.get(m.style) ?? "p", encodeLabel(m.label)].join(
      MARK_FIELD_SEPARATOR,
    ),
  );
  const route = routeMarks(view.marks)
    .flatMap((m) => index.get(m.id) ?? [])
    .slice(0, MAX_ROUTE_STOPS);
  const fields = [
    MAP_VIEW_FRAGMENT_VERSION,
    String(view.mapId),
    [scale, cx, cy].join(LIST_SEPARATOR),
    layers.join(LIST_SEPARATOR),
    markRows.join(MARK_SEPARATOR),
    route.join(LIST_SEPARATOR),
  ];
  return `${PREFIX}${fields.join(SEPARATOR)}`;
}

/** `https://…/wow-forever/map?m=<id>#view=1~…` — the view lives only in the fragment. */
export function mapViewShareUrl(origin: string, view: SharedMapView): string {
  return `${origin}${WORLD_MAP_PAGE_PATH}?m=${view.mapId}#${encodeMapViewFragment(view)}`;
}

/** True when the URL's fragment is a shared view at all (valid or not). */
export function isMapViewFragment(hash: string): boolean {
  return hash.replace(/^#/, "").startsWith(PREFIX);
}

/**
 * The six fields. Some apps percent-encode a pasted link's "~": then the first
 * four "%7E" end the leading fields and the last one starts the route (digits
 * and dots only); any between belong to a label in the marks field.
 */
function splitFields(value: string): string[] {
  if (value.includes(SEPARATOR)) return value.split(SEPARATOR);
  const parts = value.split(ENCODED_SEPARATOR);
  if (parts.length < FIELD_COUNT) return parts;
  return [...parts.slice(0, MARKS_FIELD), parts.slice(MARKS_FIELD, -1).join(ENCODED_SEPARATOR_TEXT), parts[parts.length - 1]];
}

/**
 * Every mark row we write holds ","; a marks field without one had the whole
 * link percent-encoded by an app ("," became "%2C", a label's "%" "%25"):
 * undo that one layer.
 */
function unescapeMarks(raw: string): string | null {
  if (raw === "" || raw.includes(MARK_FIELD_SEPARATOR)) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function parseLayers(raw: string): MapLayerChoice {
  const on = new Set(raw === "" ? [] : raw.split(LIST_SEPARATOR).flatMap((code) => CODE_TO_LAYER.get(code) ?? []));
  return Object.fromEntries(MAP_LAYER_IDS.map((id) => [id, on.has(id)])) as Record<MapLayerId, boolean>;
}

function decodeLabel(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function parseMark(raw: string, index: number): MapMark | null {
  const parts = raw.split(MARK_FIELD_SEPARATOR);
  if (parts.length !== MARK_FIELD_COUNT) return null;
  const [xRaw, yRaw, styleRaw, labelRaw] = parts;
  if (!COORD.test(xRaw) || !COORD.test(yRaw)) return null;
  const x = Number(xRaw) / 10;
  const y = Number(yRaw) / 10;
  if (x > 100 || y > 100) return null;
  const label = decodeLabel(labelRaw);
  if (label === null) return null;
  const style = CODE_TO_STYLE.get(styleRaw) ?? DEFAULT_MAP_MARK_STYLE;
  return { id: `s${index}`, x: roundMapCoord(x), y: roundMapCoord(y), style, label: cleanMarkLabel(label, style) };
}

/**
 * The view a fragment describes, or null when it isn't a well-formed
 * version-1 view. Never trusted: oversized input is refused unread; counts
 * are capped (the first 30 marks, the first 25 stops); a malformed mark is
 * skipped and route stops pointing at it or past the list are dropped;
 * unknown layer codes are ignored and an unknown style is a pin; labels are
 * cleaned to one plain line of at most 40 characters (shown as text only).
 * Whether the map exists is the page's check.
 */
export function decodeMapViewFragment(hash: string): SharedMapView | null {
  const fragment = hash.replace(/^#/, "");
  if (fragment.length > MAX_MAP_VIEW_FRAGMENT_LENGTH || !fragment.startsWith(PREFIX)) return null;
  const fields = splitFields(fragment.slice(PREFIX.length));
  if (fields.length !== FIELD_COUNT) return null;
  const [version, mapRaw, viewRaw, layersRaw, marksField, routeRaw] = fields;
  const marksRaw = unescapeMarks(marksField);
  if (marksRaw === null) return null;
  if (version !== MAP_VIEW_FRAGMENT_VERSION || !DIGITS.test(mapRaw)) return null;
  const mapId = Number(mapRaw);
  if (mapId <= 0) return null;
  const viewParts = viewRaw.split(LIST_SEPARATOR);
  if (viewParts.length !== 3 || !viewParts.every((p) => COORD.test(p))) return null;
  const [scaleRaw, cxRaw, cyRaw] = viewParts.map(Number);
  const viewport = {
    scale: clamp(scaleRaw / SCALE_STEPS, 1, MAX_MAP_SCALE),
    centerX: clamp(cxRaw / COORD_STEPS, 0, 1),
    centerY: clamp(cyRaw / COORD_STEPS, 0, 1),
  };
  const rows = marksRaw === "" ? [] : marksRaw.split(MARK_SEPARATOR).slice(0, MAX_MARKS_PER_MAP);
  const marks = rows.flatMap((row, i) => parseMark(row, i) ?? []);
  const kept = new Set(marks.map((m) => m.id));
  const route: string[] = [];
  for (const stop of routeRaw === "" ? [] : routeRaw.split(LIST_SEPARATOR)) {
    const id = `s${stop}`;
    if (DIGITS.test(stop) && kept.has(id) && !route.includes(id) && route.length < MAX_ROUTE_STOPS) route.push(id);
  }
  return { mapId, viewport, layers: parseLayers(layersRaw), marks: { marks, route } };
}
