import { FACTION, ZONE_KIND, type PlayerFaction, type WorldMapData, type WorldZone } from "@/games/wow-forever/types/worldMap";

/** Zones and cities you can stand in, by continent. The other faction's capitals are left out. */
export function zonesFor(data: WorldMapData, faction: PlayerFaction): Map<number, WorldZone[]> {
  const byContinent = new Map<number, WorldZone[]>();
  for (const zone of data.zones) {
    if (zone.kind === ZONE_KIND.continent) continue;
    if (zone.faction && zone.faction !== faction && zone.faction !== FACTION.neutral) continue;
    const list = byContinent.get(zone.continent) ?? [];
    list.push(zone);
    byContinent.set(zone.continent, list);
  }
  for (const list of byContinent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return byContinent;
}
