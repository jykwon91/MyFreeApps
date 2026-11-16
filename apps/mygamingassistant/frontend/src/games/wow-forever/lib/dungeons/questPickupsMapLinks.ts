import { MAX_MARK_LABEL_LENGTH, MAX_MARKS_PER_MAP, WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { MAP_MARK_STYLE } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import { DEFAULT_MAP_LAYERS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import type { QuestPickup } from "@/games/wow-forever/types/dungeons/questPickup";
import type { QuestPickupMapLink } from "@/games/wow-forever/types/dungeons/questPickupMapLink";
import { ZONE_KIND, type WorldZone } from "@/games/wow-forever/types/worldMap";
import { worldToZone, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { encodeMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

/** A shared World Map view of one map, all of it in view, with these marks (read-only until saved). */
function viewHref(mapId: number, marks: readonly MapMark[]): string {
  const fragment = encodeMapViewFragment({
    mapId,
    viewport: { scale: 1, centerX: 0.5, centerY: 0.5 },
    layers: DEFAULT_MAP_LAYERS,
    marks: { marks: marks.slice(0, MAX_MARKS_PER_MAP), route: [] },
  });
  return `${WORLD_MAP_PAGE_PATH}?m=${mapId}#${fragment}`;
}

/**
 * One World Map link per continent with each quest giver out in the world
 * marked once (several quests from one NPC share a mark; the link carries up
 * to `MAX_MARKS_PER_MAP`, `count` is how many it marks), most givers first.
 * Givers inside the dungeon or not on a zone map aren't marked.
 */
export function continentPickupLinks(pickups: readonly QuestPickup[], allZones: readonly WorldZone[]): QuestPickupMapLink[] {
  const zones = new Map(allZones.map((z) => [z.id, z]));
  const continents = allZones.filter((z) => z.kind === ZONE_KIND.continent);
  const seen = new Set<string>();
  const byContinent = new Map<number, { map: WorldZone; marks: MapMark[] }>();
  for (const { giver } of pickups) {
    const place = giver?.place;
    const zone = place ? zones.get(place.zoneId) : undefined;
    if (!giver || !place || !zone || giver.insideDungeon) continue;
    const key = `${giver.name}|${place.zoneId}|${place.x}|${place.y}`;
    const map = continents.find((c) => c.continent === zone.continent);
    if (seen.has(key) || !map) continue;
    seen.add(key);
    const at = worldToZone(map, zoneToWorld(zone, place.x, place.y));
    const entry = byContinent.get(map.id) ?? { map, marks: [] };
    entry.marks.push({
      id: `quest-giver-${entry.marks.length}`,
      x: at.x,
      y: at.y,
      label: giver.name.slice(0, MAX_MARK_LABEL_LENGTH),
      style: MAP_MARK_STYLE.quest,
    });
    byContinent.set(map.id, entry);
  }
  return [...byContinent.values()]
    .sort((a, b) => b.marks.length - a.marks.length)
    .map(({ map, marks }) => ({ mapName: map.name, count: Math.min(marks.length, MAX_MARKS_PER_MAP), href: viewHref(map.id, marks) }));
}
