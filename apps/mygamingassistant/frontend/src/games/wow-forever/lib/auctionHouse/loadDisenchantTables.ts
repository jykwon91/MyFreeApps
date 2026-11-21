import data from "@/games/wow-forever/data/professions/crafting/classic/disenchantTables.json";
import type { DisenchantTables } from "@/games/wow-forever/types/auctionHouse/disenchantTables";

/**
 * Disenchant loot tables from the cmangos classic-db, bundled at build time. JSON arrays type as
 * `number[]`, so each row is rebuilt as the tuple `DisenchantTables` names.
 */
export function loadDisenchantTables(): DisenchantTables {
  return {
    items: Object.fromEntries(
      Object.entries(data.items).map(([itemId, [table, skill]]) => [itemId, [table, skill]]),
    ),
    tables: Object.fromEntries(
      Object.entries(data.tables).map(([tableId, results]) => [
        tableId,
        Object.fromEntries(
          Object.entries(results).map(([resultId, [min, max, chance]]) => [resultId, [min, max, chance]]),
        ),
      ]),
    ),
  };
}
