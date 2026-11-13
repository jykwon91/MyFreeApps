import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";

/** Blizzard's slot names (`CharacterItem.slot`) for the equip slots that have exactly one. */
export const BLIZZARD_SLOT_FOR: Readonly<Partial<Record<ItemSlot, string>>> = {
  head: "HEAD",
  neck: "NECK",
  shoulder: "SHOULDER",
  back: "BACK",
  chest: "CHEST",
  shirt: "SHIRT",
  tabard: "TABARD",
  wrist: "WRIST",
  hands: "HANDS",
  waist: "WAIST",
  legs: "LEGS",
  feet: "FEET",
  off_hand: "OFF_HAND",
  held_in_off_hand: "OFF_HAND",
  main_hand: "MAIN_HAND",
  ranged: "RANGED",
  thrown: "RANGED",
  relic: "RANGED",
};

/** Rings and trinkets fit two slots, and the game compares with both. */
export const PAIRED_BLIZZARD_SLOTS: Readonly<Partial<Record<ItemSlot, readonly string[]>>> = {
  finger: ["FINGER_1", "FINGER_2"],
  trinket: ["TRINKET_1", "TRINKET_2"],
};
