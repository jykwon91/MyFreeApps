import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";

/** Quality names as the game shows them — always printed next to the colour. */
export const QUALITY_LABELS: Record<ItemQuality, string> = {
  poor: "Poor",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  artifact: "Artifact",
  heirloom: "Heirloom",
};

/** Text colour of an item name, in the game's quality colours (readable on light and dark). */
export const QUALITY_TEXT_CLASSES: Record<ItemQuality, string> = {
  poor: "text-gray-500 dark:text-gray-400",
  common: "text-foreground",
  uncommon: "text-green-700 dark:text-green-400",
  rare: "text-blue-700 dark:text-blue-400",
  epic: "text-purple-700 dark:text-purple-400",
  legendary: "text-orange-700 dark:text-orange-400",
  artifact: "text-amber-700 dark:text-amber-300",
  heirloom: "text-sky-700 dark:text-sky-300",
};
