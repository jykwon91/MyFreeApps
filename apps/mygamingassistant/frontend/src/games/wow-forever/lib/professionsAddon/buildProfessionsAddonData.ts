import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { PROFESSION_GROUPS, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession, isGatheringProfession } from "@/games/wow-forever/lib/guideProfession";
import { buildCraftingProfession } from "@/games/wow-forever/lib/professionsAddon/buildCraftingProfession";
import { buildGatheringProfession } from "@/games/wow-forever/lib/professionsAddon/buildGatheringProfession";
import { buildSecondaryProfession } from "@/games/wow-forever/lib/professionsAddon/buildSecondaryProfession";
import type { AddonProfession } from "@/games/wow-forever/types/professionsAddon/addonProfession";
import type { SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";

async function buildOne(key: GuideProfession): Promise<AddonProfession> {
  if (isCraftingProfession(key)) return buildCraftingProfession(key, await loadCraftingData(key));
  if (isGatheringProfession(key)) return buildGatheringProfession(key);
  return buildSecondaryProfession(key as SecondaryProfession);
}

/** Every profession the Professions page has a guide for, in the picker's order, built from the site's own data. */
export async function buildProfessionsAddonData(): Promise<AddonProfession[]> {
  const keys = PROFESSION_GROUPS.flatMap((group) => group.options.map((option) => option.id as GuideProfession));
  return Promise.all(keys.map(buildOne));
}
