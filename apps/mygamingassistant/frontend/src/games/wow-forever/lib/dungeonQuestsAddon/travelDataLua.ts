import travel from "@/games/wow-forever/data/worldMap/travel.json";
import zoneFile from "@/games/wow-forever/data/worldMap/zones.json";
import { luaString } from "@/games/wow-forever/lib/auctionHouse/luaString";

/** The continents the route planner knows; the starter isles have no way off but their own boats. */
const ROUTED_CONTINENTS: ReadonlySet<number> = new Set([0, 1]);

function zoneLines(): string[] {
  return zoneFile.zones
    .filter((zone) => ROUTED_CONTINENTS.has(zone.continent))
    .map((zone) => `    [${zone.id}] = {${zone.continent}, ${zone.bounds.join(", ")}},`);
}

function flightLines(): string[] {
  return travel.nodes.map(([id, name, continent, wx, wy, side, map, , x, y]) =>
    `    {id = ${id}, name = ${luaString(String(name))}, side = "${side}", c = ${continent}, wx = ${wx}, wy = ${wy}, map = ${map}, x = ${x}, y = ${y}},`,
  );
}

function stopLua([label, continent, wx, wy, map, , x, y]: readonly (string | number)[]): string {
  return `{label = ${luaString(String(label))}, c = ${continent}, wx = ${wx}, wy = ${wy}, map = ${map}, x = ${x}, y = ${y}}`;
}

function rideLines(): string[] {
  return travel.transports.map(
    (ride) => `    {vehicle = "${ride.vehicle}", side = "${ride.faction}", stops = {${ride.stops.map(stopLua).join(", ")}}},`,
  );
}

/** What the addon's route planner travels over: zone bounds, flight paths and their links, boats, zeppelins and the tram. */
export function travelDataLua(): string[] {
  return [
    "MGADungeonQuestsTravel = {",
    "  zones = {",
    ...zoneLines(),
    "  },",
    "  flights = {",
    ...flightLines(),
    "  },",
    `  links = {${travel.edges.map(([from, to]) => `{${from}, ${to}}`).join(", ")}},`,
    "  rides = {",
    ...rideLines(),
    "  },",
    "}",
  ];
}
