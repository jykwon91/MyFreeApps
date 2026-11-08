import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { LOOT_SECTION_ID } from "@/games/wow-forever/data/professions/crafting/disenchantOrSell";
import { GATHERING_SECTIONS } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { RECIPE_VENDORS_SECTION } from "@/games/wow-forever/data/recipeVendors/recipeVendorText";
import { isCraftingProfession, isGatheringProfession } from "@/games/wow-forever/lib/guideProfession";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

const VENDORS = { id: RECIPE_VENDORS_SECTION.id, label: RECIPE_VENDORS_SECTION.navLabel } as const;

const SECTIONS = [
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  VENDORS,
  { id: "forever", label: "What's different in Forever" },
] as const;

const CRAFTING_SECTIONS = [
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  VENDORS,
  { id: "shopping", label: "Shopping list" },
  { id: "forever", label: "What's different in Forever" },
] as const;

/** Crafting sections, with "Disenchant or sell?" after Get started for a profession that has it. */
function craftingSections(profession: CraftingProfession): readonly { id: string; label: string }[] {
  if (!CRAFTING_GUIDES[profession].lootRules) return CRAFTING_SECTIONS;
  const [start, ...rest] = CRAFTING_SECTIONS;
  return [start, { id: LOOT_SECTION_ID, label: "Disenchant or sell?" }, ...rest];
}

/** The page nav for the picked profession's guide. */
export function guideSections(profession: GuideProfession): readonly { id: string; label: string }[] {
  if (isCraftingProfession(profession)) return craftingSections(profession);
  if (isGatheringProfession(profession)) return GATHERING_SECTIONS;
  return SECTIONS;
}
