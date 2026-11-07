/**
 * Every World Map layer the player can switch on or off. Ids are stored in
 * localStorage (`MAP_LAYERS_STORAGE_KEY`) — renaming one forgets that choice.
 */
export const MAP_LAYER = {
  flightMasters: "flight_masters",
  transports: "transports",
  innkeepers: "innkeepers",
  bankers: "bankers",
  auctioneers: "auctioneers",
  stableMasters: "stable_masters",
  repair: "repair",
  vendors: "vendors",
  classTrainers: "class_trainers",
  petTrainers: "pet_trainers",
  demonTrainers: "demon_trainers",
  weaponMasters: "weapon_masters",
  ridingTrainers: "riding_trainers",
  alchemy: "profession_alchemy",
  blacksmithing: "profession_blacksmithing",
  cooking: "profession_cooking",
  enchanting: "profession_enchanting",
  engineering: "profession_engineering",
  firstAid: "profession_first_aid",
  fishing: "profession_fishing",
  herbalism: "profession_herbalism",
  leatherworking: "profession_leatherworking",
  mining: "profession_mining",
  skinning: "profession_skinning",
  tailoring: "profession_tailoring",
  questGivers: "quest_givers",
  dungeons: "dungeons",
  herbs: "herbs",
  ore: "ore",
} as const;

export type MapLayerId = (typeof MAP_LAYER)[keyof typeof MAP_LAYER];

export const MAP_LAYER_IDS: readonly MapLayerId[] = Object.values(MAP_LAYER);

export function isMapLayerId(value: unknown): value is MapLayerId {
  return MAP_LAYER_IDS.some((id) => id === value);
}
