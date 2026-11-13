/** The Auction house page's filters <-> its query string. Pure. Every value read from a link is checked against an allowlist. */
import {
  AUCTION_CATEGORY_OPTIONS,
  GEAR_CATEGORY,
  SUBCATEGORY_ID_PATTERN,
} from "@/games/wow-forever/data/auctionHouse/auctionCategories";
import {
  GEAR_SLOT_OPTIONS,
  GEAR_TYPE_OPTIONS,
  LISTINGS_FILTER_OPTIONS,
  MAX_FILTER_GOLD,
  GOLD_FILTER_DECIMALS,
  MAX_FILTER_LEVEL,
  MIN_FILTER_LEVEL,
  QUALITY_FILTER_OPTIONS,
  QUANTITY_FILTER_OPTIONS,
} from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import {
  AUCTION_CATEGORY_PARAM,
  AUCTION_LEVEL_PARAM,
  AUCTION_LISTINGS_PARAM,
  AUCTION_MAX_GOLD_PARAM,
  AUCTION_MIN_GOLD_PARAM,
  AUCTION_QUALITY_PARAM,
  AUCTION_QUANTITY_PARAM,
  AUCTION_QUERY_PARAM,
  AUCTION_SLOT_PARAM,
  AUCTION_SORT_PARAM,
  AUCTION_SUBCATEGORY_PARAM,
  AUCTION_TYPE_PARAM,
  AUCTION_USABLE_PARAM,
} from "@/games/wow-forever/data/auctionHouse/auctionHouseParams";
import { NO_AUCTION_FILTERS } from "@/games/wow-forever/data/auctionHouse/noAuctionFilters";
import { DEFAULT_AUCTION_SORT, parseAuctionSort } from "@/games/wow-forever/data/auctionSortOptions";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { AuctionCategory } from "@/games/wow-forever/types/auctionHouse/auctionCategory";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";
import type { AuctionQualityFilter } from "@/games/wow-forever/types/auctionHouse/auctionQualityFilter";

/** Whole gold, or gold with up to GOLD_FILTER_DECIMALS places (whole copper). */
const GOLD_PATTERN = new RegExp(`^\\d+(\\.\\d{1,${GOLD_FILTER_DECIMALS}})?$`);

function parseGold(raw: string | null): number | null {
  if (raw === null || !GOLD_PATTERN.test(raw)) return null;
  const gold = Number(raw);
  return gold <= MAX_FILTER_GOLD ? gold : null;
}

function parseChoice(raw: string | null, allowed: readonly number[]): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return allowed.includes(n) ? n : null;
}

function parseLevel(raw: string): number | null {
  if (raw === "") return null;
  const level = Number(raw);
  return level >= MIN_FILTER_LEVEL && level <= MAX_FILTER_LEVEL ? level : null;
}

function parseLevels(raw: string | null): [number | null, number | null] {
  const match = /^(\d{0,2})-(\d{0,2})$/.exec(raw ?? "");
  if (!match) return [null, null];
  return [parseLevel(match[1]), parseLevel(match[2])];
}

/** The listed qualities that are real chips, once each, in chip order. */
function parseQualities(raw: string | null): AuctionQualityFilter[] {
  const asked = (raw ?? "").split(",");
  return QUALITY_FILTER_OPTIONS.filter((q) => asked.includes(q));
}

function parseCategory(raw: string | null): AuctionCategory | null {
  return AUCTION_CATEGORY_OPTIONS.find((c) => c === raw) ?? null;
}

/** A subclass id; gear has no subclasses and a subclass means nothing without a category. */
function parseSubcategory(raw: string | null, category: AuctionCategory | null): number | null {
  if (raw === null || category === null || category === GEAR_CATEGORY || !SUBCATEGORY_ID_PATTERN.test(raw)) return null;
  return Number(raw);
}

function parseSlot(raw: string | null): ItemSlot | null {
  return GEAR_SLOT_OPTIONS.find((s) => s === raw) ?? null;
}

export function filtersFromParams(params: URLSearchParams): AuctionFilters {
  const [minLevel, maxLevel] = parseLevels(params.get(AUCTION_LEVEL_PARAM));
  const category = parseCategory(params.get(AUCTION_CATEGORY_PARAM));
  return {
    query: params.get(AUCTION_QUERY_PARAM) ?? NO_AUCTION_FILTERS.query,
    sort: parseAuctionSort(params.get(AUCTION_SORT_PARAM)) ?? NO_AUCTION_FILTERS.sort,
    qualities: parseQualities(params.get(AUCTION_QUALITY_PARAM)),
    minGold: parseGold(params.get(AUCTION_MIN_GOLD_PARAM)),
    maxGold: parseGold(params.get(AUCTION_MAX_GOLD_PARAM)),
    minQuantity: parseChoice(params.get(AUCTION_QUANTITY_PARAM), QUANTITY_FILTER_OPTIONS),
    minListings: parseChoice(params.get(AUCTION_LISTINGS_PARAM), LISTINGS_FILTER_OPTIONS),
    category,
    subcategory: parseSubcategory(params.get(AUCTION_SUBCATEGORY_PARAM), category),
    slot: parseSlot(params.get(AUCTION_SLOT_PARAM)),
    itemType: GEAR_TYPE_OPTIONS.find((t) => t === params.get(AUCTION_TYPE_PARAM)) ?? null,
    minLevel,
    maxLevel,
    usable: params.get(AUCTION_USABLE_PARAM) === "1",
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null || value === "") params.delete(key);
  else params.set(key, value);
}

function numberText(value: number | null): string | null {
  return value === null ? null : String(value);
}

function levelText(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  return `${min ?? ""}-${max ?? ""}`;
}

/** Writes every filter into `params` (a default is left out), leaving other params — house, profession, recipe — alone. */
export function writeFiltersToParams(params: URLSearchParams, filters: AuctionFilters): URLSearchParams {
  setOrDelete(params, AUCTION_QUERY_PARAM, filters.query);
  setOrDelete(params, AUCTION_SORT_PARAM, filters.sort === DEFAULT_AUCTION_SORT ? null : filters.sort);
  setOrDelete(params, AUCTION_QUALITY_PARAM, filters.qualities.join(","));
  setOrDelete(params, AUCTION_MIN_GOLD_PARAM, numberText(filters.minGold));
  setOrDelete(params, AUCTION_MAX_GOLD_PARAM, numberText(filters.maxGold));
  setOrDelete(params, AUCTION_QUANTITY_PARAM, numberText(filters.minQuantity));
  setOrDelete(params, AUCTION_LISTINGS_PARAM, numberText(filters.minListings));
  setOrDelete(params, AUCTION_CATEGORY_PARAM, filters.category);
  setOrDelete(params, AUCTION_SUBCATEGORY_PARAM, filters.category === null ? null : numberText(filters.subcategory));
  setOrDelete(params, AUCTION_SLOT_PARAM, filters.slot);
  setOrDelete(params, AUCTION_TYPE_PARAM, filters.itemType);
  setOrDelete(params, AUCTION_LEVEL_PARAM, levelText(filters.minLevel, filters.maxLevel));
  setOrDelete(params, AUCTION_USABLE_PARAM, filters.usable ? "1" : null);
  return params;
}
