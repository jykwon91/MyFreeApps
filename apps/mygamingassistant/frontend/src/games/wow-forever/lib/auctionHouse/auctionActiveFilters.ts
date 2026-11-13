/** Which Auction house filters are on, and what to call them. Pure. */
import { bisActiveLabel } from "@/games/wow-forever/data/auctionHouse/auctionBisCopy";
import { AUCTION_CATEGORY_LABELS } from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import { QUALITY_FILTER_LABELS } from "@/games/wow-forever/data/auctionHouse/auctionFilterLabels";
import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import { subcategoryLabel } from "@/games/wow-forever/lib/auctionHouse/itemCategoryLookup";
import { usableFilterOn } from "@/games/wow-forever/lib/auctionHouse/gearClass";
import { normalizeFilterRanges } from "@/games/wow-forever/lib/auctionHouse/normalizeFilterRanges";
import type { BisTarget } from "@/games/wow-forever/types/auctionHouse/bisTarget";
import type { ActiveAuctionFilter } from "@/games/wow-forever/types/auctionHouse/activeAuctionFilter";
import type { AuctionFilterGroup } from "@/games/wow-forever/types/auctionHouse/auctionFilterGroup";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";

/** True when any filter needs the game's item list (slot, type, required level, usable by a class, top picks). */
export function gearFilterActive(filters: AuctionFilters): boolean {
  return (
    filters.slot !== null ||
    filters.itemType !== null ||
    filters.minLevel !== null ||
    filters.maxLevel !== null ||
    usableFilterOn(filters) ||
    filters.bis !== null
  );
}

/** True when the category filter is on, which needs the item categories file. */
export function categoryFilterActive(filters: AuctionFilters): boolean {
  return filters.category !== null;
}

/** The category's name, or the chosen subclass's once the categories have loaded to name it. */
function categoryLabel(filters: AuctionFilters, categories: ItemCategoryIndex | null): string {
  if (filters.category === null) return "";
  if (filters.subcategory !== null && categories) {
    const label = subcategoryLabel(categories, filters.category, filters.subcategory);
    if (label) return label;
  }
  return AUCTION_CATEGORY_LABELS[filters.category];
}

function range(min: number | null, max: number | null, unit: string): string {
  if (min !== null && max !== null) return `${min}${unit} to ${max}${unit}`;
  if (min !== null) return `at least ${min}${unit}`;
  return `up to ${max}${unit}`;
}

/** The filters that are on, in the order the panel shows them. `classLabel` names the class "usable" means (the picked one, else the player's); `categories` names a chosen subclass once loaded; `bis` is who the top picks are for. */
export function describeActiveFilters(asked: AuctionFilters, classLabel: string, categories: ItemCategoryIndex | null, bis: BisTarget): ActiveAuctionFilter[] {
  const filters = normalizeFilterRanges(asked);
  const active: ActiveAuctionFilter[] = [];
  if (filters.qualities.length > 0) {
    active.push({ group: "quality", label: `Quality: ${filters.qualities.map((q) => QUALITY_FILTER_LABELS[q]).join(", ")}` });
  }
  if (filters.minGold !== null || filters.maxGold !== null) {
    active.push({ group: "price", label: `Price: ${range(filters.minGold, filters.maxGold, "g")}` });
  }
  if (filters.minQuantity !== null) active.push({ group: "quantity", label: `On sale: ${filters.minQuantity}+ units` });
  if (filters.minListings !== null) active.push({ group: "listings", label: `Listings: ${filters.minListings}+` });
  if (filters.category !== null) active.push({ group: "category", label: `Category: ${categoryLabel(filters, categories)}` });
  if (filters.slot !== null) active.push({ group: "slot", label: `Slot: ${SLOT_LABELS[filters.slot]}` });
  if (filters.itemType !== null) active.push({ group: "type", label: `Type: ${filters.itemType}` });
  if (filters.minLevel !== null || filters.maxLevel !== null) {
    active.push({ group: "level", label: `Level: ${range(filters.minLevel, filters.maxLevel, "")}` });
  }
  if (usableFilterOn(filters)) active.push({ group: "usable", label: `Usable by ${classLabel}` });
  if (filters.bis !== null) active.push({ group: "bis", label: bisActiveLabel(filters.bis, bis) });
  return active;
}

/** The changes that switch one filter off. */
export function removalPatch(group: AuctionFilterGroup): Partial<AuctionFilters> {
  switch (group) {
    case "quality":
      return { qualities: [] };
    case "price":
      return { minGold: null, maxGold: null };
    case "quantity":
      return { minQuantity: null };
    case "listings":
      return { minListings: null };
    case "category":
      return { category: null, subcategory: null };
    case "slot":
      return { slot: null };
    case "type":
      return { itemType: null };
    case "level":
      return { minLevel: null, maxLevel: null };
    case "usable":
      return { usable: false, classId: null };
    case "bis":
      return { bis: null, bisLevel: null };
  }
}
