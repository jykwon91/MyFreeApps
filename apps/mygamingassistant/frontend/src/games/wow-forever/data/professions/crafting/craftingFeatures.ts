import type { CraftingFeatures, CraftingProfession } from "@/games/wow-forever/types/crafting";

/**
 * Which parts of the guide each crafting profession gets. Every one
 * takes typed prices and the cheapest route; `profit` (Most profit) is for the
 * ones that make items to sell, so not Enchanting.
 */
export const CRAFTING_FEATURES: Readonly<Record<CraftingProfession, CraftingFeatures>> = {
  tailoring: { profit: true, enchantSlots: false, transmutes: false, effects: false, worksWith: null },
  enchanting: { profit: false, enchantSlots: true, transmutes: false, effects: false, worksWith: null },
  alchemy: {
    profit: true,
    enchantSlots: false,
    transmutes: true,
    effects: false,
    worksWith: { name: "Herbalism", why: "Every recipe on the route takes herbs — with Herbalism you pick them yourself as you level." },
  },
  blacksmithing: {
    profit: true,
    enchantSlots: false,
    transmutes: false,
    effects: false,
    worksWith: { name: "Mining", why: "Every recipe takes metal bars — with Mining you mine the ore and smelt the bars yourself." },
  },
  leatherworking: {
    profit: true,
    enchantSlots: false,
    transmutes: false,
    effects: false,
    worksWith: { name: "Skinning", why: "Every recipe takes leather or hides — with Skinning you skin them yourself from the beasts you kill." },
  },
  engineering: {
    profit: true,
    enchantSlots: false,
    transmutes: false,
    effects: true,
    worksWith: { name: "Mining", why: "Almost every recipe takes metal bars or stone — with Mining you mine the ore and smelt the bars yourself." },
  },
  // Bandages take cloth, which drops from humanoids — no gathering profession feeds them.
  firstaid: { profit: true, enchantSlots: false, transmutes: false, effects: false, worksWith: null },
};
