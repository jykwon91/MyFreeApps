import { CRAFT_ROUTE_MODE, type CraftRouteMode } from "@/games/wow-forever/types/craftRouteMode";
import type { SegmentedOption } from "@/games/wow-forever/types/segmentedOption";

/** The route choices on a crafting guide, in the order they show. Most profit is left out for a profession that makes nothing to sell. */
export const CRAFT_ROUTE_MODE_OPTIONS: readonly SegmentedOption<CraftRouteMode>[] = [
  { id: CRAFT_ROUTE_MODE.cheapest, label: "Cheapest" },
  { id: CRAFT_ROUTE_MODE.profit, label: "Most profit" },
  { id: CRAFT_ROUTE_MODE.default, label: "Default" },
];

/** What each shown route is called in the badge. */
export const CRAFT_ROUTE_BADGE_LABEL: Readonly<Record<CraftRouteMode, string>> = {
  cheapest: "Cheapest at auction prices",
  profit: "Most profit at auction prices",
  default: "Default route",
};

/** Words on a Most profit row. */
export const CRAFT_PROFIT_COPY = {
  materials: "Materials",
  sells: "Sells for",
  net: "Net",
  none: "No auction price: counts as nothing sold.",
  thin: (onSale: number) => `Only ${onSale} on sale, too few to trust a price: counts as nothing sold.`,
  flood: (onSale: number) => `You'd make more than the ${onSale} on sale, so expect the price to fall.`,
  rule: (min: number) => `A product counts only when ${min} or more are on sale; a price from fewer is one listing's guess.`,
} as const;
