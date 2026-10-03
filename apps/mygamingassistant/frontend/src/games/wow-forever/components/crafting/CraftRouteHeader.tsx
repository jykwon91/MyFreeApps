import { Badge } from "@platform/ui";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";

interface CraftRouteHeaderProps {
  /** The route shown was picked for your prices. */
  cheapest: boolean;
  /** Prices exist to compare with — the toggle only means something then. */
  canCompare: boolean;
  useDefault: boolean;
  onUseDefault: (useDefault: boolean) => void;
  pricesEntered: number;
  total: number;
  unknown: boolean;
}

/** "~48g 10s", "~48g + unknown", or nothing known at all. */
function totalText(total: number, unknown: boolean): string {
  if (!unknown) return formatCost(total);
  if (total > 0) return `${formatCost(total)} + unknown`;
  return "unknown";
}

/** Which route is showing, the switch back to the default, and what it should cost from here. */
export default function CraftRouteHeader({
  cheapest,
  canCompare,
  useDefault,
  onUseDefault,
  pricesEntered,
  total,
  unknown,
}: CraftRouteHeaderProps) {
  const label = cheapest ? "Cheapest for your prices" : "Default route";
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <Badge label={label} color={cheapest ? "green" : "gray"} />
        {canCompare ? <span className="text-sm">Estimated cost from here: {totalText(total, unknown)}</span> : null}
      </div>
      {canCompare ? (
        <>
          <label className="inline-flex items-center gap-3 min-h-[44px] cursor-pointer text-sm">
            <input type="checkbox" className="h-5 w-5" checked={useDefault} onChange={(e) => onUseDefault(e.target.checked)} />
            Use default route
          </label>
          <p className="text-xs text-muted-foreground">
            Based on {pricesEntered} {pricesEntered === 1 ? "price" : "prices"} you entered.
          </p>
        </>
      ) : null}
    </div>
  );
}
