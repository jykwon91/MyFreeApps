/**
 * Turn the generator's compact JSON (column lists + row arrays, written by
 * `backend/scripts/wow_world_map/build.py`) into typed World Map data.
 *
 * Rows are read by column NAME, so a reordered column can't silently shift
 * every field. Any shape problem throws — the page shows its error state
 * rather than a half-wrong map.
 */
import { isServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";
import {
  FACTION,
  INSTANCE_KIND,
  POI_KIND,
  POI_SOURCE,
  QUEST_GIVER_KIND,
  VEHICLE,
  ZONE_KIND,
  type Faction,
  type FlightNode,
  type InstanceKind,
  type MapPoi,
  type QuestGiverKind,
  type QuestInfo,
  type Transport,
  type TransportStop,
  type Vehicle,
  type WorldMapData,
  type WorldZone,
  type ZoneKind,
} from "@/games/wow-forever/types/worldMap";

type Row = readonly unknown[];

class WorldMapDataError extends Error {}

function fail(message: string): never {
  throw new WorldMapDataError(`World map data: ${message}`);
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} is not an object`);
  return value as Record<string, unknown>;
}

function list(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${what} is not a list`);
  return value;
}

function num(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${what} is not a number`);
  return value;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string") fail(`${what} is not text`);
  return value;
}

function faction(value: unknown, what: string): Faction {
  const found = Object.values(FACTION).find((f) => f === value);
  if (!found) fail(`${what} has an unknown faction`);
  return found;
}

/** Reads row fields by column name. */
function columnReader(columns: unknown, what: string) {
  const names = list(columns, `${what} columns`).map((c) => str(c, `${what} column`));
  return (row: Row, name: string): unknown => {
    const index = names.indexOf(name);
    if (index < 0) fail(`${what} has no "${name}" column`);
    return row[index];
  };
}

function decodeZone(raw: unknown): WorldZone {
  const z = record(raw, "zone");
  const kind: ZoneKind | undefined = Object.values(ZONE_KIND).find((k) => k === z.kind);
  if (!kind) fail(`zone ${String(z.id)} has an unknown kind`);
  const b = list(z.bounds, "zone bounds").map((v) => num(v, "zone bound"));
  if (b.length !== 4) fail(`zone ${String(z.id)} bounds need 4 numbers`);
  const zone: WorldZone = {
    id: num(z.id, "zone id"),
    name: str(z.name, "zone name"),
    kind,
    continent: num(z.continent, "zone continent"),
    bounds: [b[0], b[1], b[2], b[3]],
  };
  if (z.faction !== undefined) zone.faction = faction(z.faction, `zone ${zone.name}`);
  if (z.foreverOnly === true) zone.foreverOnly = true;
  return zone;
}

function decodeServices(raw: unknown): MapPoi[] {
  const payload = record(raw, "services");
  const col = columnReader(payload.columns, "services");
  return list(payload.rows, "services rows").map((r) => {
    const row = list(r, "service row");
    const subkind = col(row, "subkind");
    if (!isServiceKind(subkind)) fail(`unknown service type ${String(subkind)}`);
    const guid = num(col(row, "guid"), "service guid");
    return {
      id: `classic-${guid}`,
      kind: POI_KIND.service,
      subkind,
      tag: str(col(row, "tag"), "service tag"),
      name: str(col(row, "name"), "service name"),
      title: str(col(row, "title"), "service title"),
      zone: num(col(row, "zone"), "service zone"),
      subzone: str(col(row, "subzone"), "service subzone"),
      x: num(col(row, "x"), "service x"),
      y: num(col(row, "y"), "service y"),
      faction: faction(col(row, "faction"), "service"),
      source: POI_SOURCE.classic,
      npcId: num(col(row, "npcId"), "service npc id"),
    };
  });
}

function decodeQuest(raw: unknown, col: ReturnType<typeof columnReader>): QuestInfo {
  const row = list(raw, "quest");
  const classes = str(col(row, "classes"), "quest classes");
  return {
    id: num(col(row, "id"), "quest id"),
    title: str(col(row, "title"), "quest title"),
    minLevel: num(col(row, "minLevel"), "quest min level"),
    level: num(col(row, "level"), "quest level"),
    side: faction(col(row, "side"), "quest"),
    classes: classes ? classes.split(",") : [],
  };
}

function decodeQuestGivers(raw: unknown): MapPoi[] {
  const payload = record(raw, "quests");
  const questCol = columnReader(payload.questColumns, "quests");
  const quests = new Map<number, QuestInfo>();
  for (const q of list(payload.quests, "quests")) {
    const quest = decodeQuest(q, questCol);
    quests.set(quest.id, quest);
  }
  const col = columnReader(payload.giverColumns, "quest givers");
  return list(payload.givers, "quest givers").map((r) => {
    const row = list(r, "quest giver");
    const type = col(row, "type");
    const subkind: QuestGiverKind | undefined = Object.values(QUEST_GIVER_KIND).find((k) => k === type);
    if (!subkind) fail(`unknown quest giver type ${String(type)}`);
    const offered = list(col(row, "quests"), "giver quests").map((id) => {
      const quest = quests.get(num(id, "giver quest id"));
      if (!quest) fail(`quest giver lists unknown quest ${String(id)}`);
      return quest;
    });
    return {
      id: `classic-q${subkind === QUEST_GIVER_KIND.npc ? "n" : "o"}-${num(col(row, "guid"), "giver guid")}`,
      kind: POI_KIND.questGiver,
      subkind,
      tag: "",
      name: str(col(row, "name"), "giver name"),
      title: "",
      zone: num(col(row, "zone"), "giver zone"),
      subzone: str(col(row, "subzone"), "giver subzone"),
      x: num(col(row, "x"), "giver x"),
      y: num(col(row, "y"), "giver y"),
      faction: faction(col(row, "faction"), "quest giver"),
      source: POI_SOURCE.classic,
      npcId: subkind === QUEST_GIVER_KIND.npc ? num(col(row, "entry"), "giver entry") : undefined,
      quests: offered,
    };
  });
}

function decodeInstances(raw: unknown): MapPoi[] {
  const payload = record(raw, "dungeons");
  const col = columnReader(payload.columns, "dungeons");
  return list(payload.rows, "dungeon rows").map((r) => {
    const row = list(r, "dungeon row");
    const type = col(row, "type");
    const subkind: InstanceKind | undefined = Object.values(INSTANCE_KIND).find((k) => k === type);
    if (!subkind) fail(`unknown instance type ${String(type)}`);
    return {
      id: `classic-i-${num(col(row, "trigger"), "dungeon trigger")}`,
      kind: POI_KIND.instance,
      subkind,
      tag: String(num(col(row, "instance"), "dungeon instance")),
      name: str(col(row, "name"), "dungeon name"),
      title: str(col(row, "wing"), "dungeon wing"),
      zone: num(col(row, "zone"), "dungeon zone"),
      subzone: str(col(row, "subzone"), "dungeon subzone"),
      x: num(col(row, "x"), "dungeon x"),
      y: num(col(row, "y"), "dungeon y"),
      faction: FACTION.neutral,
      source: POI_SOURCE.classic,
      levelMin: num(col(row, "minLevel"), "dungeon min level"),
      levelMax: num(col(row, "maxLevel"), "dungeon max level"),
      requiredLevel: num(col(row, "requiredLevel"), "dungeon required level"),
    };
  });
}

function decodeTravel(raw: unknown): Pick<WorldMapData, "flightNodes" | "flightEdges" | "transports"> {
  const payload = record(raw, "travel");
  const nodeCol = columnReader(payload.nodeColumns, "flight nodes");
  const flightNodes: FlightNode[] = list(payload.nodes, "flight nodes").map((r) => {
    const row = list(r, "flight node");
    const continent = num(nodeCol(row, "continent"), "node continent");
    return {
      id: num(nodeCol(row, "id"), "node id"),
      name: str(nodeCol(row, "name"), "node name"),
      continent,
      world: { continent, wx: num(nodeCol(row, "worldX"), "node x"), wy: num(nodeCol(row, "worldY"), "node y") },
      faction: faction(nodeCol(row, "faction"), "flight node"),
      zone: num(nodeCol(row, "zone"), "node zone"),
      subzone: str(nodeCol(row, "subzone"), "node subzone"),
      x: num(nodeCol(row, "x"), "node map x"),
      y: num(nodeCol(row, "y"), "node map y"),
    };
  });
  const flightEdges = list(payload.edges, "flight edges").map((e) => {
    const pair = list(e, "flight edge");
    return [num(pair[0], "edge from"), num(pair[1], "edge to")] as const;
  });
  const stopCol = columnReader(payload.stopColumns, "transport stops");
  const transports: Transport[] = list(payload.transports, "transports").map((t) => {
    const tr = record(t, "transport");
    const vehicle: Vehicle | undefined = Object.values(VEHICLE).find((v) => v === tr.vehicle);
    if (!vehicle) fail(`transport ${String(tr.id)} has an unknown vehicle`);
    const stops: TransportStop[] = list(tr.stops, "transport stops").map((s) => {
      const row = list(s, "transport stop");
      const continent = num(stopCol(row, "continent"), "stop continent");
      return {
        label: str(stopCol(row, "label"), "stop label"),
        world: { continent, wx: num(stopCol(row, "worldX"), "stop x"), wy: num(stopCol(row, "worldY"), "stop y") },
        zone: num(stopCol(row, "zone"), "stop zone"),
        subzone: str(stopCol(row, "subzone"), "stop subzone"),
        x: num(stopCol(row, "x"), "stop map x"),
        y: num(stopCol(row, "y"), "stop map y"),
      };
    });
    return {
      id: num(tr.id, "transport id"),
      name: str(tr.name, "transport name"),
      vehicle,
      faction: faction(tr.faction, "transport"),
      stops,
    };
  });
  return { flightNodes, flightEdges, transports };
}

/** The generator's JSON files, as imported. */
export interface WorldMapFiles {
  zones: unknown;
  travel: unknown;
  services: unknown;
  quests: unknown;
  dungeons: unknown;
}

export function decodeWorldMap(files: WorldMapFiles): WorldMapData {
  const zonesPayload = record(files.zones, "zones file");
  const zones = list(zonesPayload.zones, "zones").map(decodeZone);
  const continents = record(zonesPayload.continents, "continents");
  const continentNames = new Map<number, string>(
    Object.entries(continents).map(([id, name]) => [Number(id), str(name, "continent name")]),
  );
  const pois = decodeServices(files.services);
  const questGivers = decodeQuestGivers(files.quests);
  const instances = decodeInstances(files.dungeons);
  return {
    zones,
    zoneById: new Map(zones.map((z) => [z.id, z])),
    continentNames,
    pois,
    questGivers,
    instances,
    poiById: new Map([...pois, ...questGivers, ...instances].map((p) => [p.id, p])),
    ...decodeTravel(files.travel),
  };
}
