import type { ItemQuality } from "@/games/wow-forever/data/itemSlots";

/** A quality chip: an item quality, or `unknown` for items the icon map has no entry for. */
export type AuctionQualityFilter = ItemQuality | "unknown";
