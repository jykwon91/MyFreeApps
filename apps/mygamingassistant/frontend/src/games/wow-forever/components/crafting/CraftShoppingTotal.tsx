import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import { itemsWithNoPrice } from "@/games/wow-forever/prices/missingText";
import type { ShoppingLine } from "@/games/wow-forever/types/crafting";

interface CraftShoppingTotalProps {
  lines: readonly ShoppingLine[];
  /** Undefined = no auction price for that line. */
  costOf: (line: ShoppingLine) => number | undefined;
}

/** "All of it at auction prices: ~31g 20s, not counting 2 items with no auction price." */
export default function CraftShoppingTotal({ lines, costOf }: CraftShoppingTotalProps) {
  let total = 0;
  let unpriced = 0;
  for (const line of lines) {
    const cost = costOf(line);
    if (cost === undefined) unpriced += 1;
    else total += cost;
  }
  if (unpriced === lines.length) return null;
  const rest = unpriced ? `, not counting ${itemsWithNoPrice(unpriced)}` : "";
  return (
    <p className="text-sm font-medium" data-testid="shopping-total">
      All of it at auction prices: {formatCost(total)}
      {rest}.
    </p>
  );
}
