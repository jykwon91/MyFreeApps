import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { AuctionChipOption } from "@/games/wow-forever/types/auctionHouse/auctionChipOption";
import type { ItemCategoryPlace } from "@/games/wow-forever/types/auctionHouse/itemCategoryPlace";

/** The category chips, in the order shown. */
export const AUCTION_CATEGORY_OPTIONS: readonly AuctionCategory[] = [
  "consumable",
  "trade-goods",
  "gear",
  "recipe",
  "reagent",
  "container",
  "projectile",
  "quiver",
  "misc",
];

export const AUCTION_CATEGORY_LABELS: Record<AuctionCategory, string> = {
  consumable: "Consumable",
  "trade-goods": "Trade Goods",
  gear: "Gear",
  recipe: "Recipe",
  reagent: "Reagent",
  container: "Container",
  projectile: "Projectile",
  quiver: "Quiver",
  misc: "Miscellaneous",
};

export const AUCTION_CATEGORY_CHIPS: readonly AuctionChipOption<AuctionCategory>[] = AUCTION_CATEGORY_OPTIONS.map((id) => ({
  id,
  label: AUCTION_CATEGORY_LABELS[id],
}));

/** The game's item class id -> the category it is shown under (gear's classes, weapon and armor, are one `gear` key in the file). */
export const AUCTION_CATEGORY_BY_CLASS: Readonly<Record<number, AuctionCategory>> = {
  0: "consumable",
  1: "container",
  5: "reagent",
  6: "projectile",
  7: "trade-goods",
  9: "recipe",
  11: "quiver",
  15: "misc",
};

/** Gear has no subclasses (the Gear group splits it), and `itemCategories.json` files it under this same key. */
export const GEAR_CATEGORY = "gear" satisfies AuctionCategory;

/** An item the file doesn't list (a quest item, a key, an obsolete subclass) counts as Miscellaneous. */
export const UNLISTED_ITEM_PLACE: ItemCategoryPlace = { category: "misc", subclass: null };

/** A `?sub=` value: a small whole number, the game's subclass id. */
export const SUBCATEGORY_ID_PATTERN = /^\d{1,2}$/;

/** The "All <category>" chip of the subclass row. */
export const ALL_SUBCATEGORIES_ID = "all";

/** The `<class>.<subclass>` key of `itemCategories.json`. */
export const SUBCLASS_KEY_PATTERN = /^(\d+)\.(\d+)$/;
