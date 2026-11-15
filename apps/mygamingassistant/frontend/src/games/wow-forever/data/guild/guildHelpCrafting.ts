import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

/**
 * All crafting professions whose files need to be loaded for the guild
 * "Help each other" tab (gear upgrades + enchants).
 */
export const ALL_HELP_CRAFTING_PROFESSIONS: readonly CraftingProfession[] = [
  "tailoring",
  "enchanting",
  "blacksmithing",
  "leatherworking",
  "engineering",
  "alchemy",
  "firstaid",
];
