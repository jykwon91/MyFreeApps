import { showSuccess } from "@platform/ui";
import { PROFESSIONS_ADDON_ZIP_NAME } from "@/games/wow-forever/data/professionsAddon/professionsAddonFiles";
import { professionsAddonZip } from "@/games/wow-forever/lib/professionsAddon/professionsAddonZip";
import { downloadZip } from "@/lib/downloadBlob";

/** Saves MGAProfessions.zip and says how to install it. */
export function downloadProfessionsAddon(): void {
  downloadZip(professionsAddonZip(), PROFESSIONS_ADDON_ZIP_NAME);
  showSuccess("MGA Professions is downloading. Unzip it into your AddOns folder.");
}
