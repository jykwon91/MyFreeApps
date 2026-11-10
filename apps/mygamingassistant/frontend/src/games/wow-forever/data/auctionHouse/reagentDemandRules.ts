import type { PriceFaction } from "@/games/wow-forever/types/priceFaction";

/** A made item needs this many auctions before its price can say a craft pays: one odd listing can't fake a margin. */
export const MIN_PRODUCT_LISTINGS = 5;

/** A craft "pays" only past this profit, in copper, after the house's cut… */
export const MIN_CRAFT_PROFIT_COPPER = 100;

/** …and past this share of what its materials cost. */
export const MIN_CRAFT_MARGIN = 0.1;

/** The auction house's cut of a sale: 5% on the faction houses, 15% at Blackwater (Classic). */
export const AUCTION_CUT: Readonly<Record<PriceFaction, number>> = { alliance: 0.05, horde: 0.05, neutral: 0.15 };

/** How many professions' leveling ranges a tooltip names before "+N more". */
export const MAX_LEVELING_PROFESSIONS = 2;

/** How many professions the "used in N recipes" line names before "+N more". */
export const MAX_RECIPE_PROFESSIONS = 3;
