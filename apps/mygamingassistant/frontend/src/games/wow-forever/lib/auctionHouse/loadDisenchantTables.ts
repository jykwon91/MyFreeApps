import data from "@/games/wow-forever/data/professions/crafting/classic/disenchantTables.json";
import type { DisenchantTables } from "@/games/wow-forever/types/auctionHouse/disenchantTables";

/**
 * Disenchant loot tables from the cmangos classic-db, bundled at build time, plus gear Forever added with the
 * table Classic's rule gives it (marked estimated). JSON arrays type as `number[]`, so each row is rebuilt as
 * the tuple `DisenchantTables` names.
 */
export function loadDisenchantTables(): DisenchantTables {
  const forever = Object.entries(data.foreverItems).filter(([itemId]) => !(itemId in data.items));
  return {
    items: Object.fromEntries([
      ...Object.entries(data.items).map(([itemId, [table, skill]]): [string, [number, number]] => [itemId, [table, skill]]),
      ...forever.map(([itemId, table]): [string, [number, number]] => [itemId, [table, 0]]),
    ]),
    estimated: new Set(forever.map(([itemId]) => itemId)),
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
