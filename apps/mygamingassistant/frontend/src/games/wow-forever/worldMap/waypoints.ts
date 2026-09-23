/**
 * In-game waypoint commands.
 *
 * - `/mga way <uiMapID> <x> <y> [label]` — the MGA Companion addon in this
 *   repo (`apps/mygamingassistant/addons/MGACompanion`). Sets the built-in
 *   map pin and tracks it, using the numeric map id so zone names never
 *   need to match.
 * - `/way <zone> <x> <y>` — the TomTom-style command many coordinate addons
 *   understand.
 */
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";

export interface WaypointTarget {
  zoneId: number;
  zoneName: string;
  x: number;
  y: number;
  label: string;
}

/** Keep the label to one printable line — it ends up in a chat command. */
function cleanLabel(label: string): string {
  return label.replace(/[\r\n\t|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function mgaWayCommand(target: WaypointTarget): string {
  const label = cleanLabel(target.label);
  const base = `/mga way ${target.zoneId} ${formatCoord(target.x)} ${formatCoord(target.y)}`;
  return label ? `${base} ${label}` : base;
}

export function wayCommand(target: WaypointTarget): string {
  return `/way ${target.zoneName} ${formatCoord(target.x)} ${formatCoord(target.y)}`;
}
