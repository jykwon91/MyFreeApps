import type { ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";

/** Who can use an NPC / flight path / boat. "N" = both (goblin towns). */
export const FACTION = { alliance: "A", horde: "H", neutral: "N" } as const;
export type Faction = (typeof FACTION)[keyof typeof FACTION];
export type PlayerFaction = typeof FACTION.alliance | typeof FACTION.horde;

export const ZONE_KIND = { continent: "continent", zone: "zone", city: "city" } as const;
export type ZoneKind = (typeof ZONE_KIND)[keyof typeof ZONE_KIND];

/** Whose land a zone is — the colour the game gives its name. */
export const TERRITORY = { alliance: "alliance", horde: "horde", contested: "contested" } as const;
export type Territory = (typeof TERRITORY)[keyof typeof TERRITORY];

/** A map the player can open in game — the id is the client's uiMapID. */
export interface WorldZone {
  id: number;
  name: string;
  kind: ZoneKind;
  /** World map id: 0 Eastern Kingdoms, 1 Kalimdor, 2991 Zephras Isle, 2997 Darkspear Islands. */
  continent: number;
  /** The map one level up (zoom out): a zone's continent, a continent's world map. */
  parent: number;
  /** World rectangle drawn on the map: [minX, maxX, minY, maxY]. */
  bounds: readonly [number, number, number, number];
  /** Capital cities: the faction that owns it. */
  faction?: Faction;
  /** New in Forever — nothing from the Classic seed is placed here. */
  foreverOnly?: boolean;
  /** Zones: whose territory it is (not set for new Forever zones). */
  territory?: Territory;
  /** Zones: the level range, from the client's sub-area levels. */
  levels?: readonly [number, number];
  /** The client ships a hover highlight (and hit-test outline) for this map. */
  highlight?: boolean;
}

export const MAP_KIND = { world: "world", ...ZONE_KIND } as const;
export type MapKind = (typeof MAP_KIND)[keyof typeof MAP_KIND];

/**
 * Where one world rectangle is drawn on a map. `ui` is [x0, y0, x1, y1] in
 * 0..1 of the map picture; zone maps have one region covering the whole
 * picture, the world map one per continent.
 */
export interface MapRegion {
  continent: number;
  ui: readonly [number, number, number, number];
  bounds: readonly [number, number, number, number];
}

/** Any map in the zoom-out tree: the world, a continent, a zone or a city. */
export interface MapView {
  id: number;
  name: string;
  kind: MapKind;
  /** null for the world map, the top of the tree. */
  parent: number | null;
  regions: readonly MapRegion[];
  /** The zone entry behind every map but the world map. */
  zone: WorldZone | null;
}

/** A map's outline, sampled in its own 0..100 frame (true = inside). */
export interface MapMask {
  width: number;
  height: number;
  bits: Uint8Array;
}

/** A position in world yards on one continent (+X north, +Y west). */
export interface WorldPoint {
  continent: number;
  wx: number;
  wy: number;
}

export const POI_KIND = { service: "service", questGiver: "quest_giver", instance: "instance" } as const;
export type PoiKind = (typeof POI_KIND)[keyof typeof POI_KIND];

/** Quest givers are NPCs or clickable objects (wanted posters, books). */
export const QUEST_GIVER_KIND = { npc: "npc", object: "object" } as const;
export type QuestGiverKind = (typeof QUEST_GIVER_KIND)[keyof typeof QUEST_GIVER_KIND];

export const INSTANCE_KIND = { dungeon: "dungeon", raid: "raid" } as const;
export type InstanceKind = (typeof INSTANCE_KIND)[keyof typeof INSTANCE_KIND];

export type PoiSubkind = ServiceKind | QuestGiverKind | InstanceKind;

export const POI_SOURCE = { classic: "classic", captured: "captured" } as const;
export type PoiSource = (typeof POI_SOURCE)[keyof typeof POI_SOURCE];

export interface QuestInfo {
  id: number;
  title: string;
  /** Lowest level that may take it. */
  minLevel: number;
  /** The quest's own level (its difficulty colour). */
  level: number;
  /** Which faction may take it; "N" = both. */
  side: Faction;
  /** Class-only quests list their classes; empty = every class. */
  classes: readonly string[];
}

/** One thing on the map. Every layer shares this shape. */
export interface MapPoi {
  id: string;
  kind: PoiKind;
  subkind: PoiSubkind;
  /** Narrows the subkind: class id for class trainers, profession id for profession trainers. */
  tag: string;
  name: string;
  title: string;
  zone: number;
  subzone: string;
  x: number;
  y: number;
  faction: Faction;
  source: PoiSource;
  npcId?: number;
  capturedAt?: string;
  levelMin?: number;
  levelMax?: number;
  /** Instances: the level the entrance lets you in at. */
  requiredLevel?: number;
  /** Quest givers: the quests they start. */
  quests?: readonly QuestInfo[];
}

export interface FlightNode {
  id: number;
  name: string;
  continent: number;
  world: WorldPoint;
  faction: Faction;
  zone: number;
  subzone: string;
  x: number;
  y: number;
}

export const VEHICLE = { boat: "boat", zeppelin: "zeppelin" } as const;
export type Vehicle = (typeof VEHICLE)[keyof typeof VEHICLE];

export interface TransportStop {
  label: string;
  world: WorldPoint;
  zone: number;
  subzone: string;
  x: number;
  y: number;
}

export interface Transport {
  id: number;
  name: string;
  vehicle: Vehicle;
  faction: Faction;
  stops: readonly TransportStop[];
}

export interface WorldMapData {
  zones: readonly WorldZone[];
  zoneById: ReadonlyMap<number, WorldZone>;
  /** Every map in the zoom-out tree by uiMapID, the world map included. */
  maps: ReadonlyMap<number, MapView>;
  /** The top of the tree (Azeroth). */
  worldMapId: number;
  /** Zone / continent outlines for hit-testing, by uiMapID. */
  masks: ReadonlyMap<number, MapMask>;
  continentNames: ReadonlyMap<number, string>;
  /** Service NPCs (trainers, flight masters, banks, ...). */
  pois: readonly MapPoi[];
  questGivers: readonly MapPoi[];
  /** Dungeon and raid entrances. */
  instances: readonly MapPoi[];
  /** Every layer's POIs by id. */
  poiById: ReadonlyMap<string, MapPoi>;
  flightNodes: readonly FlightNode[];
  /** Directed flight routes between node ids. */
  flightEdges: readonly (readonly [number, number])[];
  transports: readonly Transport[];
}

/** Where the player says they are. x/y are map percent on `zoneId`'s map. */
export interface PlayerSpot {
  zoneId: number;
  x: number;
  y: number;
}
