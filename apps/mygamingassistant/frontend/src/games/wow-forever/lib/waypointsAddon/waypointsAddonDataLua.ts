import { DUNGEON_TITLE, MAX_DUNGEON_PLAYERS, RAID_TITLE, SERVICE_WAYPOINT_KIND } from "@/games/wow-forever/data/waypointsAddon/waypointsAddonKinds";
import areas from "@/games/wow-forever/data/worldMap/areas.json";
import services from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import travel from "@/games/wow-forever/data/worldMap/travel.json";
import zoneFile from "@/games/wow-forever/data/worldMap/zones.json";
import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { WAYPOINT_KIND } from "@/games/wow-forever/types/waypointsAddon/waypointKind";

/** Where every row's fields sit in `Data.lua`'s `places`; the addon's `Core.lua` reads them by this order. */
const PLACE_FIELDS = "kind, name, title, map, x, y, side, tag, sub";

/** The neutral side: a place both factions can use. */
const NEUTRAL_SIDE = "N";

type Cell = string | number;

function cellLua(cell: Cell): string {
  return typeof cell === "number" ? String(cell) : luaString(cell);
}

function placeLua(cells: readonly Cell[]): string {
  return `    {${cells.map(cellLua).join(", ")}},`;
}

function zoneLines(): string[] {
  return zoneFile.zones.map(
    (zone) => `    [${zone.id}] = {${zone.continent}, ${zone.bounds.join(", ")}, ${luaString(zone.name)}},`,
  );
}

function serviceLines(): string[] {
  return services.rows.flatMap((row) => {
    const [, , subkind, tag, name, title, zone, subzone, x, y, , faction] = row as readonly Cell[];
    const kind = SERVICE_WAYPOINT_KIND[subkind as keyof typeof SERVICE_WAYPOINT_KIND];
    if (!kind) return [];
    return [placeLua([kind, name, title, zone, x, y, faction, tag, subzone])];
  });
}

function dungeonLines(dungeons: readonly Dungeon[]): string[] {
  return dungeons.flatMap((dungeon) => {
    const isRaid = (dungeon.maxPlayers ?? 0) > MAX_DUNGEON_PLAYERS;
    const levels = dungeon.levelMin === dungeon.levelMax ? `${dungeon.levelMin}` : `${dungeon.levelMin}-${dungeon.levelMax}`;
    const title = `${isRaid ? RAID_TITLE : DUNGEON_TITLE} · level ${levels}`;
    const required = dungeon.requiredLevel ?? dungeon.levelMin;
    return dungeon.entrances.flatMap((zone) =>
      zone.doors.map((door) => {
        const name = door.wing ? `${dungeon.name} (${door.wing})` : dungeon.name;
        return placeLua([WAYPOINT_KIND.dungeon, name, title, zone.zoneId, door.x, door.y, NEUTRAL_SIDE, required, zone.subzone]);
      }),
    );
  });
}

function areaLines(): string[] {
  return areas.rows.map((row) => {
    const [name, zone, x, y] = row as readonly Cell[];
    return placeLua([WAYPOINT_KIND.place, name, "", zone, x, y, NEUTRAL_SIDE, "", ""]);
  });
}

function stopLua([label, continent, wx, wy, map, , x, y]: readonly Cell[]): string {
  return `{label = ${cellLua(label)}, c = ${continent}, wx = ${wx}, wy = ${wy}, map = ${map}, x = ${x}, y = ${y}}`;
}

function rideLines(): string[] {
  return travel.transports.map(
    (ride) => `    {vehicle = "${ride.vehicle}", side = "${ride.faction}", stops = {${ride.stops.map(stopLua).join(", ")}}},`,
  );
}

/**
 * MGA Waypoints' `Data.lua`: every zone's bounds, every place the picker can guide you to and the boats, zeppelins and tram
 * that join the continents. All of it comes from the World Map's own data, never typed in by hand.
 */
export function waypointsAddonDataLua(dungeons: readonly Dungeon[]): string {
  return [
    "-- Generated from the site's World Map data. Do not edit: run `npx vitest run src/__tests__/wowWaypointsAddon.test.ts -u` from apps/mygamingassistant/frontend.",
    "MGAWaypointsData = {",
    "  -- [map id] = {continent, wxMin, wxMax, wyMin, wyMax, name}. World x runs north, world y west.",
    "  zones = {",
    ...zoneLines(),
    "  },",
    `  -- {${PLACE_FIELDS}}. x and y are percent of the map. tag: a trainer's class or profession, a dungeon's entry level.`,
    "  places = {",
    ...serviceLines(),
    ...dungeonLines(dungeons),
    ...areaLines(),
    "  },",
    "  rides = {",
    ...rideLines(),
    "  },",
    "}",
    "",
  ].join("\n");
}
