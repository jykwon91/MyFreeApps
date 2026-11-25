import ItemNameLink from "@/games/wow-forever/components/itemPages/ItemNameLink";
import { formatCost, formatNet } from "@/games/wow-forever/crafting/matPrices";
import { CRAFT_PROFIT_COPY } from "@/games/wow-forever/data/professions/crafting/craftRouteModeOptions";
import type { RowSale } from "@/games/wow-forever/types/auctionHouse/rowSale";
import type { ResolvedCraftStep } from "@/games/wow-forever/types/crafting";

/** Why the sale is short of the product's price, when it is. */
function gapNote(sale: RowSale, made: number): string | null {
  if (sale.gap === "none") return CRAFT_PROFIT_COPY.none;
  if (sale.gap === "thin") return CRAFT_PROFIT_COPY.thin(sale.onSale);
  if (made > sale.onSale) return CRAFT_PROFIT_COPY.flood(sale.onSale);
  return null;
}

/** A Most profit row's money: what the materials cost, what the made items sell for after the house's cut, and the net (profit green, cost plain). */
export default function CraftRowProfit({ entry, sale }: { entry: Pick<ResolvedCraftStep, "recipe" | "crafts">; sale: RowSale }) {
  const { recipe, crafts } = entry;
  const net = sale.materials - sale.sells;
  const profit = Math.round(net) < 0;
  const made = recipe.creates ? Math.ceil(crafts) * recipe.creates.count : 0;
  const note = gapNote(sale, made);
  return (
    <div className="space-y-1 text-sm" data-testid="craft-row-profit">
      {recipe.creates ? (
        <p className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">Makes {made}</span>
          <ItemNameLink itemId={recipe.creates.id} name={recipe.creates.name} withIcon className="inline-flex items-center gap-1.5 font-medium" />
        </p>
      ) : null}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
        <div className="flex gap-1">
          <dt className="text-muted-foreground">{CRAFT_PROFIT_COPY.materials}</dt>
          <dd>{formatCost(sale.materials)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground">{CRAFT_PROFIT_COPY.sells}</dt>
          <dd>{sale.sells > 0 ? formatCost(sale.sells) : "nothing"}</dd>
        </div>
        <div className="flex gap-1 font-medium">
          <dt className="text-muted-foreground">{CRAFT_PROFIT_COPY.net}</dt>
          <dd className={profit ? "text-green-700 dark:text-green-400" : undefined} data-testid="craft-row-net">
            {formatNet(net)}
          </dd>
        </div>
      </dl>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
