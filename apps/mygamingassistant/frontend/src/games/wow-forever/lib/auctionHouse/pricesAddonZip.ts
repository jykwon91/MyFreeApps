import { strToU8, zipSync } from "fflate";
import {
  PRICES_ADDON_DATA_FILE,
  PRICES_ADDON_FILES,
  PRICES_ADDON_FOLDER,
} from "@/games/wow-forever/data/auctionHouse/pricesAddonFiles";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

/** The addon folder, zipped, with `Data.lua` holding these houses' prices. Unzips straight into `Interface\AddOns`. */
export function pricesAddonZip(houses: readonly PriceListResponse[]): Uint8Array {
  const files: Record<string, string> = { ...PRICES_ADDON_FILES, [PRICES_ADDON_DATA_FILE]: addonPriceLua(houses) };
  const folder: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) folder[name] = strToU8(text);
  return zipSync({ [PRICES_ADDON_FOLDER]: folder });
}
