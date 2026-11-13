import type { Lineup } from "@/types/game";
import type { ZoneGroup } from "@/types/lineup/zoneGroup";
import { compareLineups } from "./compareLineups";
import { compareZones } from "./compareZones";

/** Groups lineups by target zone; zones and lineups within each are sorted. */
export function groupByZone(lineups: Lineup[]): ZoneGroup[] {
  const map = new Map<string, ZoneGroup>();
  for (const l of lineups) {
    const name = l.target_zone?.name ?? "Unknown Zone";
    const slug = l.target_zone?.slug ?? "unknown";
    if (!map.has(name)) {
      map.set(name, { zoneName: name, zoneSlug: slug, lineups: [] });
    }
    map.get(name)!.lineups.push(l);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.lineups.sort(compareLineups);
  }
  return groups.sort((a, b) => compareZones(a.zoneName, b.zoneName));
}
