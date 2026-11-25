import CraftRouteBadge from "@/games/wow-forever/components/crafting/CraftRouteBadge";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { formatCost, formatNet } from "@/games/wow-forever/crafting/matPrices";
import { MIN_PRODUCT_LISTINGS } from "@/games/wow-forever/data/auctionHouse/reagentDemandRules";
import { CRAFT_PROFIT_COPY, CRAFT_ROUTE_MODE_OPTIONS } from "@/games/wow-forever/data/professions/crafting/craftRouteModeOptions";
import { CRAFT_ROUTE_MODE, type CraftRouteMode } from "@/games/wow-forever/types/craftRouteMode";

interface CraftRouteHeaderProps {
  /** The route shown. */
  shown: CraftRouteMode;
  /** The route asked for (Most profit can fall back to Cheapest while there's nothing to sell yet). */
  mode: CraftRouteMode;
  onMode: (mode: CraftRouteMode) => void;
  /** The profession makes items to sell, so Most profit is on offer. */
  canProfit: boolean;
  /** Something has a price, so there's a cost to show. */
  hasCosts: boolean;
  /** Materials priced without you typing: auction prices and ones worked out from them. */
  autoPriced: number;
  materials: number;
  overridden: number;
  total: number;
  /** Skill the total gets you to. */
  reach: number;
  unknown: boolean;
  /** The total stops at a "pick what you can get" row rather than a missing price. */
  stopsAtChoice: boolean;
}

/** "Estimated cost to 300: ~48g", "… to reach skill 175: ~12g", or why there's no estimate yet. */
function totalText(total: number, reach: number, unknown: boolean, stopsAtChoice: boolean, profit: boolean): string {
  const amount = profit ? formatNet(total) : formatCost(total);
  const label = profit ? "Estimated net to" : "Estimated cost to";
  if (!unknown) return `${label} ${reach}: ${amount}`;
  const past = stopsAtChoice ? "you pick a recipe, so it isn't counted" : "a row needs something with no auction price";
  if (total !== 0) return `${label} reach skill ${reach}: ${amount}. Past that, ${past}.`;
  if (stopsAtChoice) return "Your next row is a choice of recipes, so there's no estimate for it.";
  return "Your next row needs something with no auction price, so there's no estimate yet.";
}

/** "Priced 8 of 9 materials automatically · 1 you set yourself." */
function basisText(autoPriced: number, materials: number, overridden: number): string {
  const own = overridden ? ` · ${overridden} you set yourself` : "";
  return `Priced ${autoPriced} of ${materials} materials automatically${own}.`;
}

/** Which route is showing, the choice of route, and what it should cost (or net) from here. */
export default function CraftRouteHeader({
  shown,
  mode,
  onMode,
  canProfit,
  hasCosts,
  autoPriced,
  materials,
  overridden,
  total,
  reach,
  unknown,
  stopsAtChoice,
}: CraftRouteHeaderProps) {
  const options = canProfit ? CRAFT_ROUTE_MODE_OPTIONS : CRAFT_ROUTE_MODE_OPTIONS.filter((o) => o.id !== CRAFT_ROUTE_MODE.profit);
  const profit = shown === CRAFT_ROUTE_MODE.profit;
  return (
    <div className="space-y-1" data-testid="craft-route-header">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <CraftRouteBadge shown={shown} />
        {hasCosts ? <span className="text-sm">{totalText(total, reach, unknown, stopsAtChoice, profit)}</span> : null}
      </div>
      {hasCosts ? (
        <SegmentedToggle label="Route" options={options} value={mode} onChange={onMode} className="flex w-full sm:w-auto [&>button]:flex-1" />
      ) : null}
      {hasCosts ? <p className="text-xs text-muted-foreground">{basisText(autoPriced, materials, overridden)}</p> : null}
      {profit ? <p className="text-xs text-muted-foreground">{CRAFT_PROFIT_COPY.rule(MIN_PRODUCT_LISTINGS)}</p> : null}
    </div>
  );
}
