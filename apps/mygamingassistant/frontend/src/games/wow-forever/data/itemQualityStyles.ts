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

/** Icon frame colour, as the game rings an item's icon in its quality colour. Common keeps the neutral frame. */
export const QUALITY_BORDER_CLASSES: Record<ItemQuality, string> = {
  poor: "border-gray-400 dark:border-gray-500",
  common: "border-border",
  uncommon: "border-green-600 dark:border-green-500",
  rare: "border-blue-600 dark:border-blue-500",
  epic: "border-purple-600 dark:border-purple-500",
  legendary: "border-orange-600 dark:border-orange-500",
  artifact: "border-amber-600 dark:border-amber-400",
  heirloom: "border-sky-600 dark:border-sky-400",
};
