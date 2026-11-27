import { useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { DROPS_ADDON_ZIP_NAME } from "@/games/wow-forever/data/dropsAddon/dropsAddonZipName";
import { loadDropsAddonZip } from "@/games/wow-forever/lib/dropsAddon/loadDropsAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

/** Loads and downloads the MGA Drops addon; `downloading` is true from the click until the zip is saved. */
export function useDownloadDropsAddon(): { download: () => Promise<void>; downloading: boolean } {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      downloadZip(await loadDropsAddonZip(), DROPS_ADDON_ZIP_NAME);
      showSuccess("MGA Drops is downloading. Unzip it into your AddOns folder.");
    } catch {
      showError("Couldn't pack the MGA Drops addon. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return { download, downloading };
}
