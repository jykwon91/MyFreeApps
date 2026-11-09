import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import { craftProfit } from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import { signedPrice } from "@/games/wow-forever/lib/auctionHouse/signedPrice";
import type { RecipePriceBreakdown } from "@/games/wow-forever/types/auctionHouse/recipePriceBreakdown";

function materialsText({ materialsCost, unpriced, lines }: RecipePriceBreakdown): string {
  if (unpriced === lines.length) return "none of its materials are on sale right now";
  if (unpriced === 0) return formatPrice(materialsCost);
  const others = unpriced === 1 ? "1 material" : `${unpriced} materials`;
  return `at least ${formatPrice(materialsCost)} (${others} with no auctions not counted)`;
}

function sellsText(product: NonNullable<RecipePriceBreakdown["product"]>): string {
  return product.price ? `${formatPrice(product.price.marketValue)} each` : "not on sale right now";
}

/** Materials per craft, what the made item sells for, and the difference when every price is known. */
export default function RecipeTotals({ breakdown }: { breakdown: RecipePriceBreakdown }) {
  const profit = craftProfit(breakdown);
  return (
    <dl className="space-y-1 rounded-xl border bg-card p-4 text-sm" data-testid="recipe-totals">
      <div className="flex flex-wrap gap-x-2">
        <dt className="font-semibold">Materials per craft:</dt>
        <dd className="font-semibold" data-testid="recipe-materials-cost">
          {materialsText(breakdown)}
        </dd>
      </div>
      {breakdown.product && (
        <div className="flex flex-wrap gap-x-2">
          <dt>Sells for:</dt>
          <dd data-testid="recipe-sells-for">{sellsText(breakdown.product)}</dd>
        </div>
      )}
      {profit !== null && (
        <div className="flex flex-wrap gap-x-2">
          <dt>Difference per craft, before the auction house&apos;s cut:</dt>
          <dd className="tabular-nums" data-testid="recipe-profit">
            {signedPrice(profit)}
          </dd>
        </div>
      )}
    </dl>
  );
}
