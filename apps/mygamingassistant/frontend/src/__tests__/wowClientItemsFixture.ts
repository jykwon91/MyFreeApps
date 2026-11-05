/** A small item file in the generated items.json shape, for search and compare tests. */
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import type { ClientItemFile } from "@/games/wow-forever/types/clientItemFile";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";

export const FIXTURE_COLUMNS = [
  "id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel",
  "armor", "weapon", "stats", "classes", "damageUnknown", "otherEffects",
];

export const FIXTURE_FILE: ClientItemFile = {
  source: "test",
  clientBuild: "1.60.1.70790",
  attribution: "Item data from the WoW Forever client via wago.tools. Game data © Blizzard Entertainment.",
  columns: FIXTURE_COLUMNS,
  items: [
    [12640, "Lionheart Helm", "epic", "head", "Plate", 61, 56, 565, null, { crit_rating: 28, hit_rating: 20, strength: 18 }, null, 0, 0],
    [11604, "Dark Iron Plate", "rare", "chest", "Plate", 59, 54, 817, null, { fire_resistance: 19, stamina: 12 }, null, 0, 0],
    [2848, "Bronze Mace", "uncommon", "one_hand", "Mace", 22, 17, null, [20, 38, 2.6], { stamina: 3 }, null, 0, 0],
    [18608, "Benediction", "epic", "two_hand", "Staff", 75, 60, null, null, { intellect: 31, spirit: 12, stamina: 10 }, ["priest"], 1, 0],
    [9001, "Crusader's Helm", "uncommon", "head", "Plate", 30, 25, 300, null, { strength: 6 }, null, 0, 0],
    [9008, "Crusader's Helm", "rare", "head", "Plate", 58, 60, 520, null, { strength: 15 }, null, 0, 0],
    [9002, "Helm of the Crusader", "rare", "head", "Plate", 62, 60, 600, null, { strength: 20 }, null, 0, 0],
    [9003, "Crusader Helm", "uncommon", "head", "Mail", 20, 15, 150, null, { agility: 4 }, null, 0, 0],
    [9004, "Twin Ring", "uncommon", "finger", null, 20, 15, null, null, { stamina: 2 }, null, 0, 0],
    [9005, "Twin Ring", "uncommon", "finger", null, 20, 15, null, null, { spirit: 2 }, null, 0, 1],
    [9006, "Ring of the Wanderer", "uncommon", "finger", null, 25, 20, null, null, {}, null, 0, 0],
    [9007, "Mageweave Robe", "uncommon", "chest", "Cloth", 34, 29, 50, null, { intellect: 8, spirit: 5 }, ["mage", "priest"], 0, 0],
  ],
};

/** Ring of the Wanderer is a random-suffix item. */
export const FIXTURE_SUFFIX_IDS = [9006];

export function fixtureList(): ClientItemList {
  return decodeClientItems(FIXTURE_FILE, FIXTURE_SUFFIX_IDS);
}
