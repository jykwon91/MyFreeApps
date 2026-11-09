import { CRAFTING_GROUP } from "@/games/wow-forever/data/professions/professionPicker";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";

/** The "Materials for" choices: every profession with recipe data, as the Professions page names them. */
export const AUCTION_MATERIAL_PROFESSIONS: readonly { id: CraftingProfession; label: string }[] = [
  ...CRAFTING_GROUP.options,
  { id: CRAFTING_PROFESSION.firstaid, label: "First Aid" },
];
