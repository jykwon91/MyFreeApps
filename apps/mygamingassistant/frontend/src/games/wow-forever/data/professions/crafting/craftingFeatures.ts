import type { CraftingFeatures, CraftingProfession } from "@/games/wow-forever/types/crafting";

/**
 * Which parts of the guide each crafting profession gets. Only Tailoring and
 * Enchanting take typed prices; the rest show the hand-picked route with no
 * cost column and no "cheapest" claim.
 */
export const CRAFTING_FEATURES: Readonly<Record<CraftingProfession, CraftingFeatures>> = {
  tailoring: { priced: true, enchantSlots: false, transmutes: false, worksWith: null },
  enchanting: { priced: true, enchantSlots: true, transmutes: false, worksWith: null },
  alchemy: {
    priced: false,
    enchantSlots: false,
    transmutes: true,
    worksWith: { name: "Herbalism", why: "Every recipe on the route takes herbs — with Herbalism you pick them yourself as you level." },
  },
  blacksmithing: {
    priced: false,
    enchantSlots: false,
    transmutes: false,
    worksWith: { name: "Mining", why: "Every recipe takes metal bars — with Mining you mine the ore and smelt the bars yourself." },
  },
};
