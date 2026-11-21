import {
  PRICES_ADDON_DATA_FILE,
  PRICES_ADDON_FILES,
  PRICES_ADDON_FOLDER,
} from "@/games/wow-forever/data/auctionHouse/pricesAddonFiles";
import { zipAddonFolder } from "@/games/wow-forever/lib/addons/zipAddonFolder";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import type { QuestItemObjective } from "@/games/wow-forever/lib/auctionHouse/loadQuestItemObjectives";
import type { CraftingByProfession } from "@/games/wow-forever/types/auctionHouse/craftingByProfession";
import type { DisenchantTables } from "@/games/wow-forever/types/auctionHouse/disenchantTables";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

/** The addon folder, zipped, with `Data.lua` holding these houses' prices, crafting demand, disenchant tables, and quest item objectives. Unzips straight into `Interface\AddOns`. */
export function pricesAddonZip(
  houses: readonly PriceListResponse[],
  crafting: CraftingByProfession,
  disenchant?: DisenchantTables,
  questItems?: ReadonlyMap<number, readonly QuestItemObjective[]>,
): Uint8Array {
  return zipAddonFolder(PRICES_ADDON_FOLDER, {
    ...PRICES_ADDON_FILES,
    [PRICES_ADDON_DATA_FILE]: addonPriceLua(houses, crafting, disenchant, questItems),
  });
}
