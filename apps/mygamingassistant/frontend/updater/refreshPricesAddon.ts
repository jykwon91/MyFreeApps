import { access, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { PRICES_ADDON_DATA_FILE, PRICES_ADDON_FOLDER } from "@/games/wow-forever/data/auctionHouse/pricesAddonFiles";
import { DEFAULT_PRICE_SERVER } from "@/games/wow-forever/data/priceServers";
import { PRICE_FACTIONS } from "@/games/wow-forever/data/priceFactions";
import { addonPriceLua } from "@/games/wow-forever/lib/auctionHouse/addonPriceLua";
import type { PriceHouse } from "@/games/wow-forever/types/priceHouse";
import type { PriceListResponse } from "@/games/wow-forever/types/priceListResponse";

/**
 * Rewrites `<addonsDir>\MGAPrices\Data.lua` with every house's current prices — the
 * same file the site's "Download the addon" button builds. Fails if the addon isn't
 * installed there, and writes a temp file then renames it so the game never reads half a file.
 * Returns the path written.
 */
export async function refreshPricesAddon(
  addonsDir: string,
  fetchHouse: (house: PriceHouse) => Promise<PriceListResponse>,
): Promise<string> {
  const addonDir = path.join(addonsDir, PRICES_ADDON_FOLDER);
  await access(addonDir).catch(() => {
    throw new Error(`MGA Prices isn't installed at ${addonDir} — download it from the site first`);
  });
  const [houses, crafting] = await Promise.all([
    Promise.all(PRICE_FACTIONS.map((faction) => fetchHouse({ server: DEFAULT_PRICE_SERVER, faction }))),
    loadAllCraftingData(),
  ]);
  const target = path.join(addonDir, PRICES_ADDON_DATA_FILE);
  const temp = `${target}.tmp`;
  await writeFile(temp, addonPriceLua(houses, crafting), "utf8");
  await rename(temp, target);
  return target;
}
