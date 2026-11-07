import { MAP_LAYER, type MapLayerId } from "@/games/wow-forever/data/worldMap/mapLayerIds";

/**
 * The short code a "Share this view" link uses for each layer. Links already
 * shared carry these — never change or reuse a code; a new layer gets a new one.
 */
export const MAP_LAYER_SHARE_CODES: Readonly<Record<MapLayerId, string>> = {
  [MAP_LAYER.flightMasters]: "fm",
  [MAP_LAYER.transports]: "tr",
  [MAP_LAYER.innkeepers]: "in",
  [MAP_LAYER.bankers]: "bk",
  [MAP_LAYER.auctioneers]: "ah",
  [MAP_LAYER.stableMasters]: "st",
  [MAP_LAYER.repair]: "rp",
  [MAP_LAYER.vendors]: "vd",
  [MAP_LAYER.classTrainers]: "ct",
  [MAP_LAYER.petTrainers]: "pt",
  [MAP_LAYER.demonTrainers]: "dt",
  [MAP_LAYER.weaponMasters]: "wm",
  [MAP_LAYER.ridingTrainers]: "rt",
  [MAP_LAYER.alchemy]: "al",
  [MAP_LAYER.blacksmithing]: "bs",
  [MAP_LAYER.cooking]: "co",
  [MAP_LAYER.enchanting]: "en",
  [MAP_LAYER.engineering]: "eg",
  [MAP_LAYER.firstAid]: "fa",
  [MAP_LAYER.fishing]: "fi",
  [MAP_LAYER.herbalism]: "hb",
  [MAP_LAYER.leatherworking]: "lw",
  [MAP_LAYER.mining]: "mi",
  [MAP_LAYER.skinning]: "sk",
  [MAP_LAYER.tailoring]: "ta",
  [MAP_LAYER.questGivers]: "qg",
  [MAP_LAYER.dungeons]: "dg",
  [MAP_LAYER.herbs]: "he",
  [MAP_LAYER.ore]: "or",
};
