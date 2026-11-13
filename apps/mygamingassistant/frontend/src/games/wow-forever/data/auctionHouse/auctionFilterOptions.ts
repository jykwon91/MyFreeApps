import { MAX_PRICE_GOLD } from "@/games/wow-forever/crafting/matPrices";
import { QUALITY_FILTER_LABELS } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { QUALITY_BORDER_CLASSES } from "@/games/wow-forever/data/itemQualityStyles";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import type { AuctionChipOption } from "@/games/wow-forever/types/auctionHouse/auctionChipOption";
import type { AuctionQualityFilter } from "@/games/wow-forever/types/auctionHouse/auctionQualityFilter";

/** The quality chips, in the game's order. Artifacts and heirlooms are never on the auction house. */
export const QUALITY_FILTER_OPTIONS: readonly AuctionQualityFilter[] = [
  "poor",
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "unknown",
];

/** "At least this many units on sale" chips. Left out = any. */
export const QUANTITY_FILTER_OPTIONS: readonly number[] = [1, 10, 100];

/** "At least this many auctions" chips. Left out = any. */
export const LISTINGS_FILTER_OPTIONS: readonly number[] = [2, 5, 20, 50];

/** Equipment slots worth filtering by. */
export const GEAR_SLOT_OPTIONS: readonly ItemSlot[] = [
  "head",
  "neck",
  "shoulder",
  "back",
  "chest",
  "wrist",
  "hands",
  "waist",
  "legs",
  "feet",
  "finger",
  "trinket",
  "one_hand",
  "main_hand",
  "off_hand",
  "two_hand",
  "ranged",
  "thrown",
  "held_in_off_hand",
];

/** Armor and weapon types, as the game files spell them (items.json `itemType`). */
export const GEAR_TYPE_OPTIONS: readonly string[] = [
  "Cloth",
  "Leather",
  "Mail",
  "Plate",
  "Shield",
  "Dagger",
  "Sword",
  "Axe",
  "Mace",
  "Fist Weapon",
  "Staff",
  "Polearm",
  "Bow",
  "Gun",
  "Crossbow",
  "Wand",
  "Thrown",
];

/** The largest gold amount and level a link may ask for. */
export const MAX_FILTER_GOLD = MAX_PRICE_GOLD;
export const MAX_FILTER_LEVEL = MAX_LEVEL;
/** The smallest gold amount and level a box takes. */
export const MIN_FILTER_GOLD = 0;
export const MIN_FILTER_LEVEL = 1;
/** Gold boxes keep whole copper (4 decimals); level boxes whole levels. Links accept no more. */
export const GOLD_FILTER_DECIMALS = 4;
export const LEVEL_FILTER_DECIMALS = 0;
/** The gold boxes' spinner step: one silver. */
export const GOLD_FILTER_STEP = 0.01;

/** Rows shown at first, and added by each "Show more" press. */
export const AUCTION_PAGE_SIZE = 50;

/** With nothing typed, a capped lookup (the Ask chat's) shows this many of the top items. */
export const BROWSE_LIMIT = 50;
/** With a search, this many matches at most. */
export const SEARCH_LIMIT = 200;

/** The inline filter panel replaces the phone's bottom sheet from this width (Tailwind's sm). */
export const AUCTION_WIDE_QUERY = "(min-width: 640px)";

/** Placeholder chips shown while the item list (gear filters) or the item categories load. */
export const GEAR_SKELETON_CHIPS = 8;

export const QUALITY_CHIPS: readonly AuctionChipOption<AuctionQualityFilter>[] = QUALITY_FILTER_OPTIONS.map((id) => ({
  id,
  label: QUALITY_FILTER_LABELS[id],
  swatch: id === "unknown" ? "border-border" : QUALITY_BORDER_CLASSES[id],
}));

export const SLOT_CHIPS: readonly AuctionChipOption<ItemSlot>[] = GEAR_SLOT_OPTIONS.map((id) => ({ id, label: SLOT_LABELS[id] }));

export const TYPE_CHIPS: readonly AuctionChipOption<string>[] = GEAR_TYPE_OPTIONS.map((id) => ({ id, label: id }));

/** The "Any" chip of a minimum choice. */
export const MIN_CHOICE_ANY = "any";

function minChoiceChips(options: readonly number[]): readonly AuctionChipOption<string>[] {
  return [{ id: MIN_CHOICE_ANY, label: "Any" }, ...options.map((n) => ({ id: String(n), label: `${n}+` }))];
}

export const QUANTITY_CHIPS = minChoiceChips(QUANTITY_FILTER_OPTIONS);
export const LISTINGS_CHIPS = minChoiceChips(LISTINGS_FILTER_OPTIONS);

/** The one chip of the "Class" group. */
export const USABLE_CHIP_ID = "usable";
