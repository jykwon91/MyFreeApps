/**
 * The World Map's switchable layers — only kinds we have data for:
 * service NPCs, quest givers and dungeon entrances (`classic*.json`),
 * boat / zeppelin / tram stops (`travel.json`) and herb / ore sample spots
 * (the crafting `sources.json` `objectSpots`, loaded only when wanted).
 */
import { MAP_LAYER, type MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { PROFESSION_LABEL, SERVICE_KIND, SERVICE_MARKER_CLASS, type ServiceKind } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { GATHER_SKILL } from "@/games/wow-forever/types/recipeSources";
import type { MapLayerChoice } from "@/games/wow-forever/types/mapLayers/mapLayerChoice";
import type { MapLayerDef } from "@/games/wow-forever/types/mapLayers/mapLayerDef";
import type { MapLayerGroup } from "@/games/wow-forever/types/mapLayers/mapLayerGroup";

export const MAP_LAYERS_STORAGE_KEY = "mga.wowForever.worldMap.layers.v1";

export const QUEST_MARKER_CLASS = "fill-cyan-400";
export const DUNGEON_MARKER_CLASS = "fill-red-700";
export const RAID_MARKER_CLASS = "fill-red-950";
export const TRANSPORT_MARKER_CLASS = "fill-indigo-400";
export const HERB_MARKER_CLASS = "fill-green-300";
export const ORE_MARKER_CLASS = "fill-yellow-700";

function service(id: MapLayerId, label: string, subkind: ServiceKind): MapLayerDef {
  return { id, label, source: { kind: "service", subkind }, markerClass: SERVICE_MARKER_CLASS[subkind] };
}

function profession(id: MapLayerId, tag: string): MapLayerDef {
  return {
    id,
    label: PROFESSION_LABEL[tag],
    source: { kind: "service", subkind: SERVICE_KIND.professionTrainer, tag },
    markerClass: SERVICE_MARKER_CLASS.profession_trainer,
  };
}

const SAMPLE_NOTE = "One sample spot per node type per zone, not every node.";

export const MAP_LAYER_DEFS: readonly MapLayerDef[] = [
  service(MAP_LAYER.flightMasters, "Flight masters", SERVICE_KIND.flightMaster),
  { id: MAP_LAYER.transports, label: "Boats, zeppelins & tram", source: { kind: "transport" }, markerClass: TRANSPORT_MARKER_CLASS },
  service(MAP_LAYER.innkeepers, "Inns", SERVICE_KIND.innkeeper),
  service(MAP_LAYER.bankers, "Banks", SERVICE_KIND.banker),
  service(MAP_LAYER.auctioneers, "Auction houses", SERVICE_KIND.auctioneer),
  service(MAP_LAYER.stableMasters, "Stable masters", SERVICE_KIND.stableMaster),
  service(MAP_LAYER.repair, "Repair", SERVICE_KIND.repair),
  service(MAP_LAYER.vendors, "Vendors", SERVICE_KIND.vendor),
  {
    id: MAP_LAYER.classTrainers,
    label: "Class trainers",
    source: { kind: "class_trainer" },
    markerClass: SERVICE_MARKER_CLASS.class_trainer,
  },
  service(MAP_LAYER.petTrainers, "Pet trainers", SERVICE_KIND.petTrainer),
  service(MAP_LAYER.demonTrainers, "Demon trainers", SERVICE_KIND.demonTrainer),
  service(MAP_LAYER.weaponMasters, "Weapon masters", SERVICE_KIND.weaponMaster),
  service(MAP_LAYER.ridingTrainers, "Riding trainers", SERVICE_KIND.ridingTrainer),
  profession(MAP_LAYER.alchemy, "alchemy"),
  profession(MAP_LAYER.blacksmithing, "blacksmithing"),
  profession(MAP_LAYER.cooking, "cooking"),
  profession(MAP_LAYER.enchanting, "enchanting"),
  profession(MAP_LAYER.engineering, "engineering"),
  profession(MAP_LAYER.firstAid, "first_aid"),
  profession(MAP_LAYER.fishing, "fishing"),
  profession(MAP_LAYER.herbalism, "herbalism"),
  profession(MAP_LAYER.leatherworking, "leatherworking"),
  profession(MAP_LAYER.mining, "mining"),
  profession(MAP_LAYER.skinning, "skinning"),
  profession(MAP_LAYER.tailoring, "tailoring"),
  {
    id: MAP_LAYER.questGivers,
    label: "Quest givers",
    source: { kind: "quest_givers" },
    markerClass: QUEST_MARKER_CLASS,
    note: "Only ones with a quest you can take now (your level + 2).",
  },
  { id: MAP_LAYER.dungeons, label: "Dungeons & raids", source: { kind: "instances" }, markerClass: DUNGEON_MARKER_CLASS },
  {
    id: MAP_LAYER.herbs,
    label: "Herbs",
    source: { kind: "gathering", skill: GATHER_SKILL.herbalism },
    markerClass: HERB_MARKER_CLASS,
    note: SAMPLE_NOTE,
  },
  {
    id: MAP_LAYER.ore,
    label: "Ore",
    source: { kind: "gathering", skill: GATHER_SKILL.mining },
    markerClass: ORE_MARKER_CLASS,
    note: SAMPLE_NOTE,
  },
];

export const MAP_LAYER_DEF_BY_ID: ReadonlyMap<MapLayerId, MapLayerDef> = new Map(MAP_LAYER_DEFS.map((d) => [d.id, d]));

export const MAP_LAYER_GROUPS: readonly MapLayerGroup[] = [
  {
    id: "travel",
    label: "Travel",
    layers: [MAP_LAYER.flightMasters, MAP_LAYER.transports, MAP_LAYER.innkeepers, MAP_LAYER.stableMasters],
    openByDefault: true,
  },
  {
    id: "services",
    label: "Services",
    layers: [MAP_LAYER.bankers, MAP_LAYER.auctioneers, MAP_LAYER.repair, MAP_LAYER.vendors],
    openByDefault: true,
  },
  {
    id: "trainers",
    label: "Trainers",
    layers: [MAP_LAYER.classTrainers, MAP_LAYER.petTrainers, MAP_LAYER.demonTrainers, MAP_LAYER.weaponMasters, MAP_LAYER.ridingTrainers],
    openByDefault: true,
  },
  {
    id: "professions",
    label: "Profession trainers",
    layers: [
      MAP_LAYER.alchemy,
      MAP_LAYER.blacksmithing,
      MAP_LAYER.cooking,
      MAP_LAYER.enchanting,
      MAP_LAYER.engineering,
      MAP_LAYER.firstAid,
      MAP_LAYER.fishing,
      MAP_LAYER.herbalism,
      MAP_LAYER.leatherworking,
      MAP_LAYER.mining,
      MAP_LAYER.skinning,
      MAP_LAYER.tailoring,
    ],
    openByDefault: false,
  },
  { id: "quests", label: "Quests & dungeons", layers: [MAP_LAYER.questGivers, MAP_LAYER.dungeons], openByDefault: true },
  { id: "gathering", label: "Gathering", layers: [MAP_LAYER.herbs, MAP_LAYER.ore], openByDefault: false },
];

const ON_BY_DEFAULT: ReadonlySet<MapLayerId> = new Set([
  MAP_LAYER.flightMasters,
  MAP_LAYER.innkeepers,
  MAP_LAYER.classTrainers,
  MAP_LAYER.dungeons,
]);

/** A new player sees flight masters, inns, their class trainers and dungeons; everything else is one tap away. */
export const DEFAULT_MAP_LAYERS: MapLayerChoice = Object.fromEntries(
  MAP_LAYER_DEFS.map((d) => [d.id, ON_BY_DEFAULT.has(d.id)]),
) as Record<MapLayerId, boolean>;
