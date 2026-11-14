/** What a recipe makes, grouped the way players look for it. */
export const RECIPE_CATEGORY = {
  food: "food",
  potions: "potions",
  bandages: "bandages",
  weapons: "weapons",
  armor: "armor",
  bags: "bags",
  enchants: "enchants",
  ammo: "ammo",
  explosives: "explosives",
  devices: "devices",
  consumables: "consumables",
  tradeGoods: "trade-goods",
  other: "other",
} as const;
export type RecipeCategory = (typeof RECIPE_CATEGORY)[keyof typeof RECIPE_CATEGORY];
