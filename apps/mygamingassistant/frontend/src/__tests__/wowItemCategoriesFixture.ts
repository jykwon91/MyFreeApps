/** A small itemCategories.json in the generated shape, for the Auction house category tests. */
import { decodeItemCategories } from "@/games/wow-forever/lib/auctionHouse/decodeItemCategories";
import type { ItemCategoriesFile } from "@/games/wow-forever/types/auctionHouse/itemCategoriesFile";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";

export const POTION = 13446; // Major Healing Potion, class 0 sub 1
export const ELIXIR = 13445; // class 0 sub 2
export const LINEN_CLOTH = 2589; // class 7 sub 5
export const WOOL_CLOTH = 2592;
export const PEACEBLOOM = 2447; // class 7 sub 9
export const JUNK = 1500; // class 15 sub 0
export const HELM = 9394; // gear

export const FIXTURE_CATEGORIES_FILE: ItemCategoriesFile = {
  source: "test",
  clientBuild: "1.60.1.70888",
  attribution: "Item data from the WoW Forever client via wago.tools. Game data © Blizzard Entertainment.",
  subclasses: { "0.1": "Potions", "0.2": "Elixirs", "7.5": "Cloth", "7.9": "Herb", "15.0": "Junk" },
  items: {
    "0.1": [POTION],
    "0.2": [ELIXIR],
    "7.5": [LINEN_CLOTH, WOOL_CLOTH],
    "7.9": [PEACEBLOOM],
    "15.0": [JUNK],
    gear: [HELM],
  },
};

export function fixtureCategories(): ItemCategoryIndex {
  return decodeItemCategories(FIXTURE_CATEGORIES_FILE);
}
