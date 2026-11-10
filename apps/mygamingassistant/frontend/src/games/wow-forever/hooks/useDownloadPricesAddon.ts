import { useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { PRICES_ADDON_ZIP_NAME } from "@/games/wow-forever/data/auctionHouse/pricesAddonFiles";
import { DEFAULT_PRICE_SERVER } from "@/games/wow-forever/data/priceServers";
import { PRICE_FACTIONS } from "@/games/wow-forever/data/priceFactions";
import { fetchAskPrices } from "@/games/wow-forever/lib/ask/askLiveData";
import { pricesAddonZip } from "@/games/wow-forever/lib/auctionHouse/pricesAddonZip";
import { downloadBlob } from "@/lib/downloadBlob";

/** Fetches every house's prices (and loads the recipe data for the crafting-demand lines) and downloads the MGA Prices addon with them inside. */
export function useDownloadPricesAddon(): { download: () => Promise<void>; downloading: boolean } {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const [houses, crafting] = await Promise.all([
        Promise.all(PRICE_FACTIONS.map((faction) => fetchAskPrices({ server: DEFAULT_PRICE_SERVER, faction }))),
        loadAllCraftingData(),
      ]);
      const zip = pricesAddonZip(houses, crafting);
      downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), PRICES_ADDON_ZIP_NAME);
      showSuccess("MGA Prices is downloading. Unzip it into your AddOns folder.");
    } catch {
      showError("Couldn't get the prices for the addon. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading };
}
