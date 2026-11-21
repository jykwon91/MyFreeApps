import data from "@/games/wow-forever/data/professions/crafting/classic/disenchantTables.json";
import type { DisenchantTables } from "@/games/wow-forever/types/auctionHouse/disenchantTables";

/** Disenchant loot tables from the cmangos classic-db, bundled at build time. */
export function loadDisenchantTables(): DisenchantTables {
  return data as DisenchantTables;
}
