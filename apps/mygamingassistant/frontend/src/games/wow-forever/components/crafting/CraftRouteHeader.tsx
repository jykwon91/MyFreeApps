import CraftRouteBadge from "@/games/wow-forever/components/crafting/CraftRouteBadge";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";

interface CraftRouteHeaderProps {
  /** Tailoring and Enchanting: the route can be the cheapest one, with a switch back to the default. */
  priced: boolean;
  /** The route shown was picked for today's prices. */
  cheapest: boolean;
  /** Something has a price, so there's a cost to show. */
  hasCosts: boolean;
  useDefault: boolean;
  onUseDefault: (useDefault: boolean) => void;
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
function totalText(total: number, reach: number, unknown: boolean, stopsAtChoice: boolean): string {
  if (!unknown) return `Estimated cost to ${reach}: ${formatCost(total)}`;
  const past = stopsAtChoice ? "you pick a recipe, so it isn't counted" : "a row needs something with no auction price";
  if (total > 0) return `Estimated cost to reach skill ${reach}: ${formatCost(total)}. Past that, ${past}.`;
  if (stopsAtChoice) return "Your next row is a choice of recipes, so there's no estimate for it.";
  return "Your next row needs something with no auction price, so there's no estimate yet.";
}

/** "Priced 8 of 9 materials automatically · 1 you set yourself." */
function basisText(autoPriced: number, materials: number, overridden: number): string {
  const own = overridden ? ` · ${overridden} you set yourself` : "";
  return `Priced ${autoPriced} of ${materials} materials automatically${own}.`;
}

/** Which route is showing, the switch back to the default, and what it should cost from here. */
export default function CraftRouteHeader({
  priced,
  cheapest,
  hasCosts,
  useDefault,
  onUseDefault,
  autoPriced,
  materials,
  overridden,
  total,
  reach,
  unknown,
  stopsAtChoice,
}: CraftRouteHeaderProps) {
  if (!priced && !hasCosts) return null;
  return (
    <div className="space-y-1" data-testid="craft-route-header">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        {priced ? <CraftRouteBadge cheapest={cheapest} /> : null}
        {hasCosts ? <span className="text-sm">{totalText(total, reach, unknown, stopsAtChoice)}</span> : null}
      </div>
      {priced && hasCosts ? (
        <label className="inline-flex items-center gap-3 min-h-[44px] cursor-pointer text-sm">
          <input type="checkbox" className="h-5 w-5" checked={useDefault} onChange={(e) => onUseDefault(e.target.checked)} />
          Use default route
        </label>
      ) : null}
      {hasCosts ? <p className="text-xs text-muted-foreground">{basisText(autoPriced, materials, overridden)}</p> : null}
    </div>
  );
}
